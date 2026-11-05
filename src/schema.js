/* Structure de la base. Elle se crée toute seule au premier appel ; pour la faire évoluer plus tard,
   AJOUTEZ une nouvelle liste à la fin de MIGRATIONS (ne modifiez jamais une liste déjà publiée). */
export const MIGRATIONS = [
  [
    `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
    `INSERT OR IGNORE INTO meta(k, v) VALUES('rev', '1')`,
    `CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS products (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       price INTEGER NOT NULL CHECK (price >= 0),
       descr TEXT NOT NULL DEFAULT '',
       img TEXT NOT NULL DEFAULT '',
       img_v INTEGER NOT NULL DEFAULT 0,
       stock INTEGER CHECK (stock IS NULL OR stock >= 0),
       active INTEGER NOT NULL DEFAULT 1,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS orders (
       id TEXT PRIMARY KEY,
       no INTEGER NOT NULL UNIQUE,
       ref TEXT NOT NULL UNIQUE,
       token TEXT NOT NULL UNIQUE,
       status TEXT NOT NULL,
       pay_state TEXT NOT NULL DEFAULT '',
       np_ref TEXT,
       np_trxref TEXT,
       json TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at)`,
    `CREATE INDEX IF NOT EXISTS orders_paystate ON orders(pay_state, created_at)`,
    `CREATE INDEX IF NOT EXISTS orders_np_ref ON orders(np_ref)`,
    `CREATE INDEX IF NOT EXISTS orders_np_trxref ON orders(np_trxref)`,
    `CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)`
  ],
  [ // version 2 : vidéos de la boutique (liens TikTok, YouTube, etc.)
    `CREATE TABLE IF NOT EXISTS videos (
       id TEXT PRIMARY KEY,
       kind TEXT NOT NULL,
       ref TEXT NOT NULL,
       url TEXT NOT NULL DEFAULT '',
       title TEXT NOT NULL DEFAULT '',
       vertical INTEGER NOT NULL DEFAULT 0,
       pos INTEGER NOT NULL DEFAULT 0,
       active INTEGER NOT NULL DEFAULT 1,
       created_at INTEGER NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS videos_uq ON videos(kind, ref)`,
    `CREATE INDEX IF NOT EXISTS videos_pos ON videos(pos, created_at)`
  ]
];
