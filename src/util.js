/* Petits outils communs au serveur */
export class Fail extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
});
const enc = new TextEncoder();
export const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function hmacBytes(key, data) {
  const k = await crypto.subtle.importKey('raw', enc.encode(String(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(String(data))));
}
export const hmacHex = async (key, data) => hex(await hmacBytes(key, data));

/* comparaison à temps constant : on compare les empreintes (longueur fixe), jamais les textes eux-mêmes */
export async function safeEq(a, b) {
  const [x, y] = await Promise.all([hmacBytes('cmp', a), hmacBytes('cmp', b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randStr(n, alphabet = ALNUM) {
  const b = crypto.getRandomValues(new Uint8Array(n)); let s = '';
  for (let i = 0; i < n; i++) s += alphabet[b[i] % alphabet.length];
  return s;
}
export const randToken = () => randStr(24);                       // jeton secret de suivi d'une commande
export const randId = p => p + randStr(10, 'abcdefghjkmnpqrstuvwxyz23456789');
export const genRef = () => randStr(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); // code de commande lisible (WhatsApp, appel)

export async function readJson(request, max = 60000) {
  const ct = request.headers.get('content-type') || '';
  if (!/json/i.test(ct)) throw new Fail(415, 'Requête non acceptée.');
  const text = await request.text();
  if (text.length > max) throw new Fail(413, 'Requête trop volumineuse.');
  let v; try { v = JSON.parse(text); } catch (e) { throw new Fail(400, 'Requête illisible.'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Fail(400, 'Requête illisible.');
  return v;
}

export const clientKey = async (request, env, tag) => {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'local';
  return tag + ':' + (await hmacHex(env.SESSION_SECRET || env.ADMIN_PASSWORD || 'zap', ip)).slice(0, 24);
};

/* limitation de débit simple, stockée dans D1 : max demandes par fenêtre */
export async function rateHit(db, key, max, windowMs, now = Date.now()) {
  const r = await db.prepare('SELECT n, until FROM rate WHERE k=?').bind(key).first();
  if (r && r.until > now) {
    if (r.n >= max) return false;
    await db.prepare('UPDATE rate SET n=n+1 WHERE k=?').bind(key).run();
    return true;
  }
  await db.prepare('INSERT INTO rate(k,n,until) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=1, until=excluded.until').bind(key, now + windowMs).run();
  return true;
}
export async function rateCount(db, key, now = Date.now()) {
  const r = await db.prepare('SELECT n, until FROM rate WHERE k=?').bind(key).first();
  return r && r.until > now ? r.n : 0;
}
export const rateClear = (db, key) => db.prepare('DELETE FROM rate WHERE k=?').bind(key).run();

export function httpsUrl(u) {
  try { const x = new URL(String(u || '')); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; }
}
