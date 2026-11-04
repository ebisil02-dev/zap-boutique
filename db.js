/* Accès à la base D1 : structure, lecture et écriture des réglages, produits et commandes */
import { canonShop, canonProducts } from '../public/core.js';
import { MIGRATIONS } from './schema.js';
import SEED from './seed.js';

const ready = new WeakMap();
export function ensureSchema(db) {
  if (!db) throw new Error('Base de données non reliée (binding DB manquant dans wrangler.toml).');
  if (!ready.has(db)) ready.set(db, migrate(db).catch(e => { ready.delete(db); throw e; }));
  return ready.get(db);
}
async function migrate(db) {
  let cur = 0;
  try { const r = await db.prepare("SELECT v FROM meta WHERE k='schema'").first(); cur = r ? +r.v : 0; } catch (e) { cur = 0; }
  for (let i = cur; i < MIGRATIONS.length; i++) {
    const st = MIGRATIONS[i].map(s => db.prepare(s));
    st.push(db.prepare("INSERT INTO meta(k, v) VALUES('schema', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(i + 1)));
    await db.batch(st);
  }
  await seed(db);
}
/* premier démarrage : réglages et produits de départ (ne s'exécute que si la base est vide) */
async function seed(db) {
  const has = await db.prepare("SELECT (SELECT COUNT(*) FROM settings) AS s, (SELECT COUNT(*) FROM products) AS p").first();
  if (has && (has.s > 0 || has.p > 0)) return;
  const now = Date.now(), st = [];
  st.push(db.prepare('INSERT OR IGNORE INTO settings(id, json, updated_at) VALUES(?,?,?)').bind('main', JSON.stringify(canonShop(SEED.settings)), now));
  (SEED.products || []).forEach((p, i) => st.push(db.prepare(
    'INSERT OR IGNORE INTO products(id,name,price,descr,img,img_v,stock,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(p.id, p.name, Math.max(0, p.price | 0), p.desc || '', p.img || '', now, p.stock == null ? null : Math.max(0, p.stock | 0), p.on === false ? 0 : 1, now + i, now)));
  st.push(bumpStmt(db));
  await db.batch(st);
}

/* ---------- version des données (sert au rafraîchissement automatique de l'espace vendeur) ---------- */
export const bumpStmt = db => db.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k='rev'");
export async function getRev(db) { const r = await db.prepare("SELECT v FROM meta WHERE k='rev'").first(); return r ? +r.v : 0; }
export const commit = (db, stmts) => db.batch([...stmts, bumpStmt(db)]);

/* ---------- réglages ---------- */
export async function getShop(db) {
  const r = await db.prepare("SELECT json FROM settings WHERE id='main'").first();
  let j = null; try { j = r ? JSON.parse(r.json) : null; } catch (e) { j = null; }
  return canonShop(j);
}
export const saveShopStmt = (db, shop) => db.prepare(
  "INSERT INTO settings(id,json,updated_at) VALUES('main',?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at").bind(JSON.stringify(shop), Date.now());

/* ---------- produits ---------- */
const PCOLS = "id, name, price, descr, img_v, stock, active, created_at, (img <> '') AS has_img";
export const prodOut = r => ({ id: r.id, name: r.name, price: r.price, desc: r.descr, img: r.has_img ? '/api/img/' + r.id + '?v=' + r.img_v : '', stock: r.stock, on: !!r.active, createdAt: r.created_at });
export async function listProducts(db, { all = false } = {}) {
  const q = 'SELECT ' + PCOLS + ' FROM products' + (all ? '' : ' WHERE active=1') + ' ORDER BY created_at, name';
  return (await db.prepare(q).all()).results.map(prodOut);
}
export async function getProduct(db, id) {
  const r = await db.prepare('SELECT ' + PCOLS + ' FROM products WHERE id=?').bind(id).first();
  return r ? prodOut(r) : null;
}
export const publicProducts = list => canonProducts(list);

/* ---------- commandes ---------- */
const COLS = ['id', 'no', 'ref', 'status', 'createdAt', 'updatedAt'];
export function rowToOrder(r) {
  let o = {}; try { o = JSON.parse(r.json); } catch (e) { o = {}; }
  return { ...o, id: r.id, no: r.no, ref: r.ref, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
export function orderToJson(o) {
  const x = { ...o }; COLS.forEach(k => { delete x[k]; }); delete x.token; return JSON.stringify(x);
}
/* ce que voit le client qui suit sa commande (le jeton secret fait office de mot de passe) */
export function publicOrder(o, token) {
  return {
    ref: o.ref, token, status: o.status, mode: o.mode, zoneName: o.zoneName, address: o.address, date: o.date, from: o.from, to: o.to,
    name: o.name, phone: o.phone, items: o.items.map(i => ({ name: i.name, price: i.price, qty: i.qty })), subtotal: o.subtotal, fee: o.fee, feeNote: o.feeNote, total: o.total,
    pay: { method: o.pay.method, paid: !!o.pay.paid, claimed: !!o.pay.claimed, state: o.pay.state || '', txn: o.pay.txn || '' }
  };
}
export async function getOrderByToken(db, token) {
  if (!/^[A-Za-z0-9]{20,40}$/.test(String(token || ''))) return null;
  return await db.prepare('SELECT * FROM orders WHERE token=?').bind(token).first();
}
export const restockStmts = (db, items, now = Date.now()) =>
  (items || []).filter(i => i.pid).map(i => db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND stock IS NOT NULL').bind(i.qty, now, i.pid));

/* adresse publique de la boutique, retenue à chaque connexion du vendeur (sert aux liens des alertes lancées par la tâche automatique) */
export async function setOrigin(db, origin) {
  await db.prepare("INSERT INTO meta(k,v) VALUES('origin',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(origin).run();
}
export async function getOrigin(db) {
  const r = await db.prepare("SELECT v FROM meta WHERE k='origin'").first(); return r ? r.v : '';
}
