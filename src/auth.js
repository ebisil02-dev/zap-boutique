/* Connexion du vendeur : un mot de passe (secret ADMIN_PASSWORD) puis un cookie signé, illisible par les scripts de la page */
import { hmacHex, safeEq, Fail, rateHit, rateCount, rateClear, clientKey } from './util.js';

const COOKIE = 'zap_s', DAYS = 30;
const key = env => env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
export const adminConfigured = env => !!env.ADMIN_PASSWORD && String(env.ADMIN_PASSWORD).length >= 8;

function readCookie(request, name) {
  const h = request.headers.get('cookie') || '';
  for (const p of h.split(';')) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i).trim() === name) return p.slice(i + 1).trim(); }
  return '';
}
export async function sessionCookie(env, secure) {
  const exp = Date.now() + DAYS * 864e5, sig = await hmacHex(key(env), 's1.' + exp);
  return `${COOKIE}=${exp}.${sig}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}
export const clearCookie = secure => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;

export async function isAdmin(request, env) {
  if (!adminConfigured(env)) return false;
  const c = readCookie(request, COOKIE); if (!c) return false;
  const [exp, sig] = c.split('.');
  if (!/^\d{10,15}$/.test(exp || '') || +exp < Date.now() || !sig) return false;
  return safeEq(sig, await hmacHex(key(env), 's1.' + exp));
}
/* toute route d'administration passe ici : session valide + protection contre les requêtes venues d'un autre site */
export async function requireAdmin(request, env) {
  if (!adminConfigured(env)) throw new Fail(503, 'L’espace vendeur n’est pas encore configuré (secret ADMIN_PASSWORD, 8 caractères minimum).', { code: 'noadmin' });
  if (!(await isAdmin(request, env))) throw new Fail(401, 'Connexion requise.', { code: 'auth' });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (request.headers.get('x-zap') !== '1') throw new Fail(403, 'Requête refusée.');
    const o = request.headers.get('origin');
    if (o && new URL(o).host !== new URL(request.url).host) throw new Fail(403, 'Requête refusée.');
  }
}
/* 5 mots de passe faux par quart d'heure et par appareil */
export async function login(request, env, password) {
  if (!adminConfigured(env)) throw new Fail(503, 'L’espace vendeur n’est pas encore configuré (secret ADMIN_PASSWORD, 8 caractères minimum).', { code: 'noadmin' });
  const k = await clientKey(request, env, 'login');
  if ((await rateCount(env.DB, k)) >= 5) throw new Fail(429, 'Trop d’essais. Patientez un quart d’heure.', { code: 'rate' });
  if (!(await safeEq(String(password || ''), env.ADMIN_PASSWORD))) {
    await rateHit(env.DB, k, 99, 15 * 60e3);
    throw new Fail(401, 'Mot de passe incorrect.', { code: 'badpw' });
  }
  await rateClear(env.DB, k);
  return sessionCookie(env, new URL(request.url).protocol === 'https:');
}
