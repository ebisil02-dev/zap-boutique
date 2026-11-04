/* Remplit le nom et le téléphone de la boutique dans la page de confidentialité (à partir des réglages du vendeur). */
(async () => {
  try {
    const r = await fetch('/api/shop', { headers: { accept: 'application/json' } });
    const j = await r.json();
    const sh = j.shop || {};
    document.querySelectorAll('[data-shop=name]').forEach(e => { e.textContent = sh.name || 'la boutique'; });
    document.querySelectorAll('[data-shop=phone]').forEach(e => { e.textContent = sh.phone || 'le numéro indiqué sur la boutique'; });
    if (sh.name) document.title = 'Confidentialité · ' + sh.name;
  } catch (e) { /* la page reste lisible sans ces informations */ }
})();
