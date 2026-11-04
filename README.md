# Boutique Zap (Grand Ma)

Boutique de commande en ligne pour mobile : le client choisit ses produits, un créneau de livraison, son quartier, et paie (MTN MoMo / Orange Money via Notch Pay, ou à la livraison). Le vendeur gère commandes, produits et réglages depuis `/#vendeur` et reçoit des alertes.

**Pour la mise en ligne, suivez [GUIDE-MISE-EN-LIGNE.md](GUIDE-MISE-EN-LIGNE.md).**

## Architecture (un seul « Worker » Cloudflare)

- `public/` : l'application (boutique client + espace vendeur), servie par Cloudflare.
- `src/` : l'API (commandes, produits, connexion vendeur, webhook Notch Pay, alertes Telegram/ntfy, tâche automatique toutes les 10 min).
- Base de données : Cloudflare **D1** (liaison `DB`). La structure se crée seule (`src/schema.js`) ; produits et réglages de départ dans `src/seed.js`.
- `public/core.js` : calculs partagés (prix, créneaux, frais) utilisés par le serveur **et** le navigateur. Le serveur reste l'autorité : il recalcule tout.
- Secrets (jamais dans Git) : `ADMIN_PASSWORD`, `SESSION_SECRET`, `NOTCHPAY_KEY`, `NOTCHPAY_HASH`, `FALLBACK_EMAIL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NTFY_TOPIC` (+ `NTFY_SERVER`, `NTFY_TOKEN`).

## Développement

Node.js ≥ 22.13.

```bash
npm install
npm test            # tests du serveur, sur un simulateur D1 (node:sqlite) : aucun compte requis
npm install --save-dev playwright && npx playwright install chromium
npm run test:e2e    # parcours complet dans Chromium (téléphone simulé), paiement et alertes simulés
npx wrangler dev    # site local ; secrets locaux dans .dev.vars
```

Faire évoluer la base : **ajouter** une liste à la fin de `MIGRATIONS` (`src/schema.js`), ne jamais modifier une liste déjà publiée.

Les branches GitHub autres que `main` reçoivent une adresse d'aperçu **qui partage la base de données de production**.
