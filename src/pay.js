/* Paiement en ligne avec Notch Pay (MTN MoMo, Orange Money). La clé secrète ne quitte jamais le serveur. */
import { hmacHex, safeEq, httpsUrl } from './util.js';

const API = 'https://api.notchpay.co';
const FAILED = ['failed', 'canceled', 'cancelled', 'expired', 'rejected', 'abandoned'];
export const payConfigured = env => !!env.NOTCHPAY_KEY;
export const payTest = env => /^pk_test/i.test(env.NOTCHPAY_KEY || '');
/* seul « complete » vaut paiement reçu ; le reste est « en cours » tant que Notch Pay n'annonce pas un échec */
export const kindOf = st => { st = String(st || '').toLowerCase(); return st === 'complete' ? 'paid' : FAILED.includes(st) ? 'failed' : 'pending'; };

export function cleanPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 9 && d[0] === '6') d = '237' + d;
  return /^237[62]\d{8}$/.test(d) ? '+' + d : '';
}
const hdr = env => ({ Authorization: env.NOTCHPAY_KEY, 'Content-Type': 'application/json', Accept: 'application/json' });

export async function createPayment(env, { amount, name, phone, desc, reference, callback }) {
  const body = {
    amount, currency: 'XAF',
    customer: { name: (name || 'Client').slice(0, 60), email: env.FALLBACK_EMAIL || 'client@example.com', ...(cleanPhone(phone) ? { phone: cleanPhone(phone) } : {}) },
    description: String(desc || '').slice(0, 120), reference, callback
  };
  let res, j = null;
  try {
    res = await fetch(`${API}/payments`, { method: 'POST', headers: hdr(env), body: JSON.stringify(body) });
    j = await res.json().catch(() => null);
  } catch (e) { res = null; }
  const url = httpsUrl(j && j.authorization_url);
  if (!res || !res.ok || !url) {
    console.error('Notch Pay : création refusée', res ? res.status : 'réseau', JSON.stringify(j || {}).slice(0, 300));
    throw new Error('notchpay-create');
  }
  const t = j.transaction || {};
  return { url, ref: String(t.reference || ''), trxref: String(t.trxref || reference) };
}

/* seule la réponse de Notch Pay (jamais l'adresse ou le contenu reçu) dit si un paiement est réussi */
export async function fetchPayment(env, id) {
  const res = await fetch(`${API}/payments/${encodeURIComponent(id)}`, { headers: { Authorization: env.NOTCHPAY_KEY, Accept: 'application/json' } });
  if (!res.ok) throw new Error('notchpay-lookup-' + res.status);
  const j = await res.json().catch(() => null), t = j && (j.transaction || j);
  if (!t || !t.status) throw new Error('notchpay-lookup-empty');
  return { kind: kindOf(t.status), status: String(t.status), amount: Number(t.amount) || 0, currency: String(t.currency || '').toUpperCase(), trxref: String(t.trxref || ''), ref: String(t.reference || id) };
}

/* signature de l'appel entrant : HMAC-SHA256 (hex) du corps brut, avec la « clé de hachage » du webhook */
export async function verifySignature(env, raw, sig) {
  if (!env.NOTCHPAY_HASH || !sig) return false;
  const want = await hmacHex(env.NOTCHPAY_HASH, raw);
  return safeEq(String(sig).trim().toLowerCase().replace(/^sha256=/, ''), want);
}
/* les noms exacts des champs du webhook peuvent varier : on récolte tous les identifiants plausibles
   (puis on vérifie chacun auprès de Notch Pay, donc un faux identifiant ne peut rien valider) */
export function candidateIds(payload) {
  const found = new Set();
  const walk = (v, d) => {
    if (d > 4 || v == null) return;
    if (typeof v === 'string') { if (/^trx\.[A-Za-z0-9._-]{4,70}$/.test(v) || /^[A-Z0-9]{4}-[a-z0-9]{3}$/.test(v)) found.add(v); return; }
    if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], d + 1);
  };
  walk(payload, 0);
  return [...found];
}
