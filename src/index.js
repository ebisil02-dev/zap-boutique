/* Point d'entrée : routes de la boutique, de l'espace vendeur et du paiement */
import { canonShop, canonProducts } from '../public/core.js';
import { Fail, json, readJson, rateHit, clientKey } from './util.js';
import { ensureSchema, getShop, listProducts, publicProducts, getRev, getOrderByToken, rowToOrder, publicOrder, setOrigin } from './db.js';
import { login, requireAdmin, clearCookie, adminConfigured } from './auth.js';
import { createOrder, patchOrder, deleteOrder, retryPayment, switchToCash, applyPayment, checkPayment, housekeeping } from './orders.js';
import { saveSettings, createProduct, updateProduct, deleteProduct, productImage, adminState } from './catalog.js';
import { payConfigured, payTest, fetchPayment, verifySignature, candidateIds } from './pay.js';
import { channels, notify } from './notify.js';
import { listVideos, publicVideos, addVideo, patchVideo, deleteVideo } from './videos.js';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src https:; frame-src https://www.tiktok.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.instagram.com https://www.facebook.com https://drive.google.com; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function secure(res) {
  const h = new Headers(res.headers);
  h.set('content-security-policy', h.get('content-security-policy') || CSP);
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'no-referrer');
  h.set('x-frame-options', 'DENY');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
const routes = [];
const route = (method, re, fn) => routes.push([method, re, fn]);
const originOf = request => new URL(request.url).origin;
const secureReq = request => new URL(request.url).protocol === 'https:';

/* ---------- public ---------- */
route('GET', /^\/api\/health$/, async (request, env) => {
  const out = { ok: true, db: false, admin: adminConfigured(env), pay: payConfigured(env), payTest: payTest(env), webhookHash: !!env.NOTCHPAY_HASH, channels: channels(env) };
  try { await ensureSchema(env.DB); out.db = true; } catch (e) { out.ok = false; out.error = String(e && e.message || e).slice(0, 200); }
  return json(out, out.ok ? 200 : 500);
});
route('GET', /^\/api\/shop$/, async (request, env) => {
  const [shop, products, videos] = await Promise.all([getShop(env.DB), listProducts(env.DB), listVideos(env.DB)]);
  shop.online.on = shop.online.on && payConfigured(env);
  return json({ shop, products: publicProducts(products), videos: publicVideos(videos), now: Date.now() });
});
route('GET', /^\/api\/img\/([A-Za-z0-9_-]{1,40})$/, (request, env, ctx, m) => productImage(env, m[1]));

route('POST', /^\/api\/orders$/, async (request, env, ctx) => {
  const r = await createOrder(env, ctx, await readJson(request), { origin: originOf(request), request });
  return json({ ok: true, token: r.token, order: r.pub, payUrl: r.payUrl || '' }, 201);
});
route('GET', /^\/api\/orders\/([A-Za-z0-9]{20,40})$/, async (request, env, ctx, m) => {
  let row = await getOrderByToken(env.DB, m[1]);
  if (!row) throw new Fail(404, 'Commande introuvable.');
  const url = new URL(request.url);
  if (url.searchParams.get('check') === '1' && ['pending', 'failed'].includes(row.pay_state)) {
    if (await checkPayment(env, ctx, row, originOf(request))) row = await getOrderByToken(env.DB, m[1]);
  }
  return json({ order: publicOrder(rowToOrder(row), m[1]) });
});
route('POST', /^\/api\/orders\/([A-Za-z0-9]{20,40})\/pay$/, async (request, env, ctx, m) => {
  if (!(await rateHit(env.DB, await clientKey(request, env, 'retry'), 12, 10 * 60e3))) throw new Fail(429, 'Trop d’essais. Patientez quelques minutes.');
  const row = await getOrderByToken(env.DB, m[1]);
  if (!row) throw new Fail(404, 'Commande introuvable.');
  return json({ ok: true, payUrl: await retryPayment(env, ctx, row, originOf(request)) });
});
route('POST', /^\/api\/orders\/([A-Za-z0-9]{20,40})\/cash$/, async (request, env, ctx, m) => {
  const row = await getOrderByToken(env.DB, m[1]);
  if (!row) throw new Fail(404, 'Commande introuvable.');
  const o = await switchToCash(env, ctx, row, originOf(request));
  return json({ ok: true, order: publicOrder(o, m[1]) });
});
/* le client revient de la page de paiement : on interroge Notch Pay (jamais l'adresse reçue) puis on l'envoie sur sa page de suivi */
route('GET', /^\/retour\/([A-Za-z0-9]{20,40})$/, async (request, env, ctx, m) => {
  const row = await getOrderByToken(env.DB, m[1]);
  if (row) await checkPayment(env, ctx, row, originOf(request));
  return new Response(null, { status: 302, headers: { Location: '/?o=' + m[1] + '#merci', 'cache-control': 'no-store' } });
});
/* appel automatique de Notch Pay quand un paiement change d'état */
route('POST', /^\/api\/notchpay\/webhook$/, async (request, env, ctx) => {
  if (!env.NOTCHPAY_KEY || !env.NOTCHPAY_HASH) return json({ error: 'Webhook non configuré.' }, 503);
  const raw = await request.text();
  if (raw.length > 100000) return json({ error: 'trop gros' }, 413);
  if (!(await verifySignature(env, raw, request.headers.get('x-notch-signature')))) return json({ error: 'Signature invalide.' }, 401);
  let body = {}; try { body = JSON.parse(raw) || {}; } catch (e) { return json({ error: 'illisible' }, 400); }
  const ids = candidateIds(body).slice(0, 6);
  let handled = 0;
  for (const id of ids) {
    const row = await env.DB.prepare('SELECT * FROM orders WHERE np_ref=? OR np_trxref=?').bind(id, id).first();
    if (!row || !row.np_ref) continue;
    try { await applyPayment(env, ctx, row, await fetchPayment(env, row.np_ref), originOf(request)); handled++; }
    catch (e) { console.error('Webhook : vérification impossible', e && e.message); return json({ error: 'vérification impossible' }, 502); } // Notch Pay réessaiera
    break;
  }
  return json({ ok: true, handled });
});

/* ---------- espace vendeur ---------- */
route('POST', /^\/api\/admin\/login$/, async (request, env) => {
  const b = await readJson(request, 2000);
  const cookie = await login(request, env, b.password);
  await setOrigin(env.DB, originOf(request)).catch(() => {});
  return json({ ok: true }, 200, { 'set-cookie': cookie });
});
route('POST', /^\/api\/admin\/logout$/, async (request) => json({ ok: true }, 200, { 'set-cookie': clearCookie(secureReq(request)) }));
route('GET', /^\/api\/admin\/state$/, async (request, env) => { await requireAdmin(request, env); return json(await adminState(env, originOf(request))); });
route('GET', /^\/api\/admin\/poll$/, async (request, env) => { await requireAdmin(request, env); return json({ rev: await getRev(env.DB) }); });
route('PUT', /^\/api\/admin\/settings$/, async (request, env) => { await requireAdmin(request, env); return json({ ok: true, settings: await saveSettings(env, await readJson(request, 40000)) }); });
route('POST', /^\/api\/admin\/products$/, async (request, env) => { await requireAdmin(request, env); return json({ ok: true, product: await createProduct(env, await readJson(request, 300000)) }, 201); });
route('PUT', /^\/api\/admin\/products\/([A-Za-z0-9_-]{1,40})$/, async (request, env, ctx, m) => { await requireAdmin(request, env); return json({ ok: true, product: await updateProduct(env, m[1], await readJson(request, 300000)) }); });
route('DELETE', /^\/api\/admin\/products\/([A-Za-z0-9_-]{1,40})$/, async (request, env, ctx, m) => { await requireAdmin(request, env); await deleteProduct(env, m[1]); return json({ ok: true }); });
route('POST', /^\/api\/admin\/videos$/, async (request, env) => { await requireAdmin(request, env); return json({ ok: true, video: await addVideo(env, await readJson(request, 4000)) }, 201); });
route('PATCH', /^\/api\/admin\/videos\/([A-Za-z0-9_-]{1,40})$/, async (request, env, ctx, m) => { await requireAdmin(request, env); return json({ ok: true, video: await patchVideo(env, m[1], await readJson(request, 2000)) }); });
route('DELETE', /^\/api\/admin\/videos\/([A-Za-z0-9_-]{1,40})$/, async (request, env, ctx, m) => { await requireAdmin(request, env); await deleteVideo(env, m[1]); return json({ ok: true }); });
route('POST', /^\/api\/admin\/orders$/, async (request, env, ctx) => {
  await requireAdmin(request, env);
  const r = await createOrder(env, ctx, await readJson(request), { admin: true, origin: originOf(request) });
  return json({ ok: true, order: r.order }, 201);
});
route('PATCH', /^\/api\/admin\/orders\/([A-Za-z0-9_-]{1,40})$/, async (request, env, ctx, m) => { await requireAdmin(request, env); return json({ ok: true, order: await patchOrder(env, ctx, m[1], await readJson(request, 4000)) }); });
route('DELETE', /^\/api\/admin\/orders\/([A-Za-z0-9_-]{1,40})$/, async (request, env, ctx, m) => { await requireAdmin(request, env); await deleteOrder(env, m[1]); return json({ ok: true }); });
route('POST', /^\/api\/admin\/notify-test$/, async (request, env) => {
  await requireAdmin(request, env);
  const ch = channels(env);
  if (!ch.telegram && !ch.ntfy) throw new Fail(409, 'Aucun service d’alerte n’est configuré (Telegram ou ntfy). Voir le guide.');
  return json({ ok: true, sent: await notify(env, { title: 'Test Zap Boutique', text: 'Si vous lisez ceci, les alertes de commande fonctionnent.', url: originOf(request) + '/#vendeur' }) });
});

async function handle(request, env, ctx) {
  const url = new URL(request.url), p = url.pathname, method = request.method;
  if (p.startsWith('/api/') || p.startsWith('/retour/')) {
    if (!env.DB) throw new Fail(500, 'La base de données n’est pas reliée (voir le guide, étape « Base de données »).', { code: 'nodb' });
    await ensureSchema(env.DB);
    for (const [m, re, fn] of routes) {
      if (m !== method) continue;
      const mm = re.exec(p);
      if (mm) return fn(request, env, ctx, mm);
    }
    throw new Fail(404, 'Introuvable.');
  }
  if (method !== 'GET' && method !== 'HEAD') return new Response('Méthode non autorisée', { status: 405, headers: { Allow: 'GET, HEAD' } });
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const res = await handle(request, env, ctx);
      return secure(res);
    } catch (e) {
      if (e instanceof Fail) return secure(json({ error: e.message, ...e.extra }, e.status));
      console.error('Erreur', e && e.stack || e);
      return secure(json({ error: 'Erreur du serveur. Réessayez dans un instant.' }, 500));
    }
  },
  async scheduled(event, env, ctx) {
    await ensureSchema(env.DB);
    ctx.waitUntil(housekeeping(env, ctx).then(r => console.log('Tâche automatique', JSON.stringify(r))));
  }
};
