/* Démarrage : le cœur partagé (module) devient disponible partout, puis les écrans se chargent dans l'ordre. */
import * as C from './core.js';
Object.assign(globalThis, C);
const load = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src;
  s.onload = res; s.onerror = () => rej(new Error('Chargement impossible : ' + src));
  document.head.appendChild(s);
});
try { for (const f of ['/shop.js', '/admin.js', '/app.js']) await load(f); }
catch (e) {
  console.error(e);
  const r = document.getElementById('root');
  if (r) r.innerHTML = '<p style="padding:24px;font:16px system-ui">La boutique n’a pas pu se charger. Vérifiez votre connexion puis rechargez la page.</p>';
}
