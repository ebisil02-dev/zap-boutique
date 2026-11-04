/* Produits, réglages et état complet de l'espace vendeur */
import { canonShop, norm } from '../public/core.js';
import { Fail, randId } from './util.js';
import { getShop, saveShopStmt, listProducts, getProduct, commit, getRev, rowToOrder } from './db.js';
import { payConfigured, payTest } from './pay.js';
import { channels } from './notify.js';

export async function saveSettings(env, body) {
  // garde-fou : un envoi vide ou tronqué ne doit jamais remettre la boutique à zéro
  if (!body || typeof body.name !== 'string' || !Array.isArray(body.week) || !Array.isArray(body.slots)) throw new Fail(400, 'Réglages incomplets : rien n’a été enregistré.');
  const shop = canonShop(body); // tout est revérifié et nettoyé : le navigateur n'est jamais cru sur parole
  await commit(env.DB, [saveShopStmt(env.DB, shop)]);
  return shop;
}

const IMG = /^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/;
function cleanProduct(b) {
  const name = norm(b.name).slice(0, 80);
  if (name.length < 2) throw new Fail(400, 'Indiquez le nom du produit.');
  const price = Math.floor(+b.price);
  if (!(price >= 0 && price <= 1e7)) throw new Fail(400, 'Prix invalide.');
  let stock = b.stock; stock = (stock === '' || stock == null) ? null : Math.floor(+stock);
  if (stock != null && !(stock >= 0 && stock <= 1e6)) throw new Fail(400, 'Stock invalide.');
  let img = b.img;
  if (img === undefined || img === 'keep' || (typeof img === 'string' && img.startsWith('/api/img/'))) img = undefined;
  else if (img === '' || img === null) img = '';
  else if (typeof img !== 'string' || img.length > 260000 || !IMG.test(img)) throw new Fail(400, 'Photo non acceptée (formats webp, png ou jpeg, 190 Ko environ).');
  return { name, price, desc: String(b.desc || '').trim().slice(0, 200), stock, on: b.on !== false, img };
}
export async function createProduct(env, body) {
  const p = cleanProduct(body || {}), db = env.DB, id = randId('p'), now = Date.now();
  await commit(db, [db.prepare('INSERT INTO products(id,name,price,descr,img,img_v,stock,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id, p.name, p.price, p.desc, p.img || '', now, p.stock, p.on ? 1 : 0, now, now)]);
  return getProduct(db, id);
}
export async function updateProduct(env, id, body) {
  const db = env.DB, old = await getProduct(db, id);
  if (!old) throw new Fail(404, 'Produit introuvable.');
  const p = cleanProduct(body || {}), now = Date.now();
  const imgSql = p.img === undefined ? '' : ', img=?, img_v=?', imgArgs = p.img === undefined ? [] : [p.img, now];
  await commit(db, [db.prepare(`UPDATE products SET name=?, price=?, descr=?, stock=?, active=?, updated_at=?${imgSql} WHERE id=?`)
    .bind(p.name, p.price, p.desc, p.stock, p.on ? 1 : 0, now, ...imgArgs, id)]);
  return getProduct(db, id);
}
export async function deleteProduct(env, id) {
  const db = env.DB, r = await db.prepare('DELETE FROM products WHERE id=?').bind(id).run();
  if (r.meta && r.meta.changes === 0) throw new Fail(404, 'Produit introuvable.');
  await commit(db, []);
}
/* photo d'un produit : adresse versionnée (?v=…), donc mise en cache longtemps par le navigateur */
export async function productImage(env, id) {
  const r = await env.DB.prepare('SELECT img FROM products WHERE id=?').bind(String(id)).first();
  const m = r && IMG.exec(r.img || '');
  if (!m) return new Response('Introuvable', { status: 404 });
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]), 'cache-control': 'public, max-age=31536000, immutable', 'content-security-policy': "default-src 'none'; sandbox" } });
}

export async function adminState(env, origin) {
  const db = env.DB;
  const [settings, products, rows, rev] = await Promise.all([
    getShop(db), listProducts(db, { all: true }),
    db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 300').all(), getRev(db)
  ]);
  return {
    rev, settings, products, orders: rows.results.map(rowToOrder),
    server: {
      online: { configured: payConfigured(env), test: payTest(env), webhookUrl: origin + '/api/notchpay/webhook', webhookSigned: !!env.NOTCHPAY_HASH },
      channels: channels(env)
    }
  };
}
