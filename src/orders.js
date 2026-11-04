/* Commandes : création (le serveur recalcule tout), suivi par le client, gestion par le vendeur, paiements */
import {
  buildOrder, daysAvail, shopNow, zoneOptions, payMethods, onlineBlocked, validPhone, norm, sum, money, PAYN, dayShort, slotLabel, waNum
} from '../public/core.js';
import { Fail, randToken, randId, genRef, randStr, rateHit, clientKey } from './util.js';
import { getShop, listProducts, rowToOrder, orderToJson, publicOrder, restockStmts, commit, getOrigin } from './db.js';
import { createPayment, fetchPayment, payConfigured } from './pay.js';
import { notify } from './notify.js';

export const STATUSES = ['nouvelle', 'confirmee', 'livree', 'annulee'];
const later = (ctx, p) => { const q = Promise.resolve(p).catch(e => console.error('tâche en arrière-plan', e && e.message)); if (ctx && ctx.waitUntil) ctx.waitUntil(q); return q; };

/* ---------- alertes vendeur (aucune donnée personnelle) ---------- */
function alertText(o) {
  const n = sum(o.items, i => i.qty);
  const when = (o.mode === 'livraison' ? 'Livraison ' : 'Retrait ') + dayShort(o.date).toLowerCase() + ' ' + slotLabel(o.from, o.to);
  const pay = o.pay.method === 'online' ? (o.pay.paid ? 'Paye en ligne' : 'Paiement en ligne en cours')
    : PAYN[o.pay.method] + (o.pay.method === 'cash' ? '' : o.pay.claimed ? ' (annonce paye, a verifier)' : ' (a verifier)');
  return `${o.ref} · ${money(o.total)} · ${n} article${n > 1 ? 's' : ''}\n${when}${o.zoneName ? ' · ' + o.zoneName : ''}\n${pay}`;
}
async function alertNew(env, o, origin, title = 'Nouvelle commande') {
  const base = origin || await getOrigin(env.DB);
  return notify(env, { title, text: alertText(o), url: base ? base + '/#vendeur' : '' });
}

/* ---------- création ---------- */
export async function createOrder(env, ctx, input, { admin = false, origin = '', request = null } = {}) {
  const db = env.DB;
  if (!input || typeof input !== 'object') throw new Fail(400, 'Commande illisible.');
  if (!admin && request) {
    if (!(await rateHit(db, await clientKey(request, env, 'order'), 12, 10 * 60e3))) throw new Fail(429, 'Trop de commandes en peu de temps. Patientez quelques minutes.', { code: 'rate' });
  }
  const [shop, prods] = await Promise.all([getShop(db), listProducts(db)]);

  /* panier : les prix viennent de la base, jamais du navigateur */
  const want = new Map();
  for (const it of Array.isArray(input.items) ? input.items : []) {
    const id = String(it && it.id || ''), q = +(it && it.qty);
    if (!id || !Number.isInteger(q) || q < 1 || q > 99) throw new Fail(400, 'Panier invalide.');
    want.set(id, (want.get(id) || 0) + q);
  }
  if (!want.size) throw new Fail(400, 'Votre panier est vide.');
  if (want.size > 40) throw new Fail(400, 'Panier trop grand.');
  const items = [];
  for (const [id, qty] of want) {
    const p = prods.find(x => x.id === id);
    if (!p) throw new Fail(409, 'Un produit de votre panier n’est plus proposé. Le catalogue a été mis à jour.', { code: 'gone', id });
    if (qty > 99) throw new Fail(400, 'Quantité trop grande.');
    if (p.stock != null && qty > p.stock) throw new Fail(409, p.stock === 0 ? `« ${p.name} » est épuisé.` : `Il ne reste que ${p.stock} « ${p.name} ».`, { code: 'stock', id, left: p.stock });
    items.push({ id: p.id, name: p.name, price: p.price, qty });
  }

  const mode = input.mode;
  if (mode !== 'livraison' && mode !== 'retrait') throw new Fail(400, 'Choisissez livraison ou retrait.');
  if (mode === 'livraison' && !shop.delivery) throw new Fail(400, 'La livraison n’est pas proposée.');
  if (mode === 'retrait' && !shop.pickup) throw new Fail(400, 'Le retrait n’est pas proposé.');
  let zone = '', addr = '';
  if (mode === 'livraison') {
    const opts = zoneOptions(shop);
    zone = String(input.zone || '');
    if (opts.length) { if (!opts.includes(zone)) throw new Fail(400, 'Choisissez votre quartier.'); } else zone = '';
    addr = norm(input.addr).slice(0, 160);
    if (addr.length < 3) throw new Fail(400, 'Indiquez un repère pour le livreur.');
  }
  const date = String(input.date || ''), slot = String(input.slot || '');
  const day = daysAvail(admin ? { ...shop, lead: 0 } : shop, shopNow()).find(d => d.date === date);
  if (!day || !day.slots.some(s => s.from + '-' + s.to === slot)) throw new Fail(409, 'Ce créneau n’est plus disponible. Choisissez-en un autre.', { code: 'slot' });
  const name = norm(input.name).slice(0, 60), phone = norm(input.phone).slice(0, 24);
  if (name.length < 2) throw new Fail(400, 'Indiquez votre nom.');
  if (!validPhone(phone)) throw new Fail(400, 'Vérifiez votre numéro de téléphone.');
  if (!admin && input.consent !== true) throw new Fail(400, 'Cochez la case pour valider votre commande.');

  const pay = String(input.pay || '');
  const onlineOn = !admin && payConfigured(env);
  if (!payMethods(shop, onlineOn).includes(pay)) throw new Fail(400, 'Ce moyen de paiement n’est pas disponible.', { code: 'paymethod' });
  if (pay === 'online' && onlineBlocked(mode, zone)) throw new Fail(400, 'Le paiement en ligne n’est pas possible tant que les frais de livraison ne sont pas confirmés.');

  const draft = buildOrder(shop, items, { mode, zone, addr, date, slot, name, phone, pay, paid: !!input.paid, txn: String(input.txn || '').replace(/[^\w.\-]/g, '').slice(0, 40), ref: 'XXXX' });
  if (shop.minOrder && draft.subtotal < shop.minOrder && !admin) throw new Fail(400, 'Commande minimum : ' + money(shop.minOrder) + '.');

  const now = Date.now(), id = randId('o'), token = randToken();
  const order = { ...draft, pay: { ...draft.pay, state: pay === 'online' ? 'pending' : '' }, source: admin ? 'saisie' : 'boutique', consentAt: admin ? 0 : now, note: '', restocked: false };

  for (let tries = 0; ; tries++) {
    order.ref = genRef();
    const st = items.filter(i => prods.find(p => p.id === i.id).stock != null)
      .map(i => db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock IS NOT NULL').bind(i.qty, now, i.id));
    st.push(db.prepare("INSERT INTO orders(id,no,ref,token,status,pay_state,json,created_at,updated_at) VALUES(?, (SELECT COALESCE(MAX(no),0)+1 FROM orders), ?, ?, 'nouvelle', ?, ?, ?, ?)")
      .bind(id, order.ref, token, order.pay.state, orderToJson(order), now, now));
    try { await commit(db, st); break; }
    catch (e) {
      const m = String(e && e.message || e);
      if (/UNIQUE/i.test(m) && tries < 8) continue;
      if (/CHECK/i.test(m)) throw new Fail(409, 'Le stock vient de changer. Vérifiez votre panier.', { code: 'stock' });
      throw e;
    }
  }
  const row = await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  const full = rowToOrder(row);

  if (pay === 'online') {
    try {
      const np = await createPayment(env, {
        amount: full.total, name, phone, desc: `Commande ${full.ref} · ${shop.name}`,
        reference: `${full.ref}-${randStr(3, 'abcdefghjkmnpqrstuvwxyz23456789')}`, callback: `${origin}/retour/${token}`
      });
      await db.prepare('UPDATE orders SET np_ref=?, np_trxref=? WHERE id=?').bind(np.ref, np.trxref, id).run();
      return { id, no: full.no, order: full, pub: publicOrder(full, token), token, payUrl: np.url };
    } catch (e) {
      await patchOrder(env, ctx, id, { status: 'annulee', note: 'Paiement en ligne indisponible au moment de la commande.' });
      throw new Fail(502, 'Le paiement en ligne n’a pas pu démarrer. Aucun montant n’a été débité. Choisissez un autre moyen de paiement.', { code: 'pay' });
    }
  }
  if (!admin) later(ctx, alertNew(env, full, origin));
  return { id, no: full.no, order: full, pub: publicOrder(full, token), token };
}

/* ---------- suivi par le client (jeton secret) ---------- */
export async function retryPayment(env, ctx, row, origin) {
  const o = rowToOrder(row);
  if (o.pay.method !== 'online' || o.pay.paid || o.status !== 'nouvelle' || !payConfigured(env)) throw new Fail(409, 'Cette commande ne peut pas être payée en ligne.');
  const shop = await getShop(env.DB);
  const np = await createPayment(env, {
    amount: o.total, name: o.name, phone: o.phone, desc: `Commande ${o.ref} · ${shop.name}`,
    reference: `${o.ref}-${randStr(3, 'abcdefghjkmnpqrstuvwxyz23456789')}`, callback: `${origin}/retour/${row.token}`
  }).catch(() => { throw new Fail(502, 'Le paiement en ligne n’a pas pu démarrer. Aucun montant n’a été débité.', { code: 'pay' }); });
  const pay = { ...o.pay, state: 'pending' };
  await commit(env.DB, [env.DB.prepare("UPDATE orders SET np_ref=?, np_trxref=?, pay_state='pending', json=?, updated_at=? WHERE id=?")
    .bind(np.ref, np.trxref, orderToJson({ ...o, pay }), Date.now(), row.id)]);
  return np.url;
}
export async function switchToCash(env, ctx, row, origin) {
  const o = rowToOrder(row);
  if (o.pay.method !== 'online' || o.pay.paid || o.status !== 'nouvelle') throw new Fail(409, 'Cette commande ne peut pas changer de moyen de paiement.');
  const pay = { method: 'cash', paid: false, claimed: false, txn: '', state: '' };
  const next = { ...o, pay };
  await commit(env.DB, [env.DB.prepare("UPDATE orders SET pay_state='', json=?, updated_at=? WHERE id=?").bind(orderToJson(next), Date.now(), row.id)]);
  later(ctx, alertNew(env, next, origin));
  return next;
}

/* ---------- résultat d'un paiement (retour du client, webhook, tâche automatique) ---------- */
export async function applyPayment(env, ctx, row, np, origin = '') {
  const db = env.DB, o = rowToOrder(row), now = Date.now();
  if (np.kind === 'paid') {
    if (o.pay.state === 'paid') return 'already';
    if (np.amount !== o.total || (np.currency && np.currency !== 'XAF')) {
      const next = { ...o, pay: { ...o.pay, state: 'mismatch' }, note: `Montant reçu ${np.amount} ${np.currency} ≠ total ${o.total}. À vérifier chez Notch Pay.` };
      await commit(db, [db.prepare("UPDATE orders SET pay_state='mismatch', json=?, updated_at=? WHERE id=?").bind(orderToJson(next), now, row.id)]);
      later(ctx, notify(env, { title: 'Paiement a verifier', text: `${o.ref} : le montant recu ne correspond pas au total de la commande.`, url: origin ? origin + '/#vendeur' : '' }));
      return 'mismatch';
    }
    const next = { ...o, pay: { ...o.pay, paid: true, state: 'paid', verified: true, txn: np.trxref || o.pay.txn || '' } };
    const r = await db.prepare("UPDATE orders SET pay_state='paid', json=?, updated_at=? WHERE id=? AND pay_state<>'paid'").bind(orderToJson(next), now, row.id).run();
    if (r.meta && r.meta.changes === 0) return 'already';
    await commit(db, []);
    later(ctx, o.status === 'annulee'
      ? notify(env, { title: 'Paiement a rembourser', text: `${o.ref} : ${money(o.total)} recus sur une commande deja annulee. Remboursez le client ou rouvrez la commande.`, url: origin ? origin + '/#vendeur' : '' })
      : alertNew(env, next, origin, 'Nouvelle commande payee'));
    return 'paid';
  }
  if (np.kind === 'failed' && o.pay.state === 'pending') {
    const next = { ...o, pay: { ...o.pay, state: 'failed' } };
    await commit(db, [db.prepare("UPDATE orders SET pay_state='failed', json=?, updated_at=? WHERE id=? AND pay_state='pending'").bind(orderToJson(next), now, row.id)]);
    return 'failed';
  }
  return 'pending';
}
export async function checkPayment(env, ctx, row, origin = '') {
  if (!row.np_ref || !payConfigured(env) || !['pending', 'failed'].includes(row.pay_state)) return null;
  try { return await applyPayment(env, ctx, row, await fetchPayment(env, row.np_ref), origin); }
  catch (e) { console.error('Vérification du paiement impossible', e && e.message); return null; }
}

/* ---------- gestion par le vendeur ---------- */
export async function patchOrder(env, ctx, id, patch) {
  const db = env.DB, row = await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (!row) throw new Fail(404, 'Commande introuvable.');
  const o = rowToOrder(row), now = Date.now(), st = [];
  let status = o.status, pay = { ...o.pay }, fee = o.fee, total = o.total, feeNote = o.feeNote, note = o.note || '', restocked = !!o.restocked;

  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw new Fail(400, 'Statut inconnu.');
    if (o.status === 'annulee' && patch.status !== 'annulee') throw new Fail(409, 'Une commande annulée ne peut pas être rouverte. Saisissez-la à nouveau.');
    if (patch.status === 'annulee' && !restocked) { st.push(...restockStmts(db, o.items, now)); restocked = true; }
    if (patch.status === 'livree' && pay.method === 'cash' && !pay.paid) pay.paid = true;
    status = patch.status;
  }
  if (patch.pay && typeof patch.pay.paid === 'boolean' && patch.pay.paid !== pay.paid) {
    if (pay.method === 'online' && pay.verified && !patch.pay.paid) throw new Fail(409, 'Ce paiement a été confirmé par Notch Pay : il ne peut pas être annulé ici.');
    pay.paid = patch.pay.paid;
    if (pay.method === 'online') pay.state = pay.paid ? 'paid' : 'unpaid';
  }
  if (patch.fee !== undefined) {
    if (o.mode !== 'livraison') throw new Fail(400, 'Cette commande n’est pas une livraison.');
    if (o.status !== 'nouvelle' && o.status !== 'confirmee' && o.feeNote !== 'À confirmer') throw new Fail(409, 'Les frais ne peuvent plus être modifiés.');
    if (pay.method === 'online' && pay.paid) throw new Fail(409, 'Le paiement en ligne est déjà encaissé : les frais ne peuvent plus changer.');
    const f = Math.floor(+patch.fee);
    if (!(f >= 0 && f <= 1e6)) throw new Fail(400, 'Frais de livraison invalides.');
    fee = f; feeNote = ''; total = o.subtotal + f;
  }
  if (patch.note !== undefined) note = String(patch.note || '').slice(0, 300);

  const next = { ...o, status, pay, fee, total, feeNote, note, restocked };
  st.push(db.prepare('UPDATE orders SET status=?, pay_state=?, json=?, updated_at=? WHERE id=?').bind(status, pay.state || '', orderToJson(next), now, id));
  await commit(db, st);
  return { ...next, updatedAt: now };
}
export async function deleteOrder(env, id) {
  const db = env.DB, r = await db.prepare('DELETE FROM orders WHERE id=?').bind(id).run();
  if (r.meta && r.meta.changes === 0) throw new Fail(404, 'Commande introuvable.');
  await commit(db, []);
}

/* ---------- tâche automatique (toutes les 10 minutes) ---------- */
export async function housekeeping(env, ctx) {
  const db = env.DB, now = Date.now();
  const rows = (await db.prepare("SELECT * FROM orders WHERE pay_state IN ('pending','failed') AND created_at < ? ORDER BY created_at LIMIT 50").bind(now - 10 * 60e3).all()).results;
  const origin = rows.length ? await getOrigin(db) : '';
  let cancelled = 0, paid = 0;
  for (const r of rows) {
    const res = await checkPayment(env, ctx, r, origin);
    if (res === 'paid') { paid++; continue; }
    if (r.created_at < now - 45 * 60e3 && res !== 'paid') {
      const cur = await db.prepare('SELECT * FROM orders WHERE id=?').bind(r.id).first();
      if (cur && ['pending', 'failed'].includes(cur.pay_state) && cur.status === 'nouvelle') {
        await patchOrder(env, ctx, r.id, { status: 'annulee', note: 'Paiement en ligne non reçu : commande annulée automatiquement, stock remis.' }); cancelled++;
      }
    }
  }
  await db.prepare('DELETE FROM rate WHERE until < ?').bind(now).run();
  return { checked: rows.length, paid, cancelled };
}
