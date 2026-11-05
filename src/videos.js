/* Vidéos de la boutique : le vendeur colle un lien, le serveur le reconnaît et ne garde que « plateforme + identifiant » */
import { parseVideo, videoRefOk, norm } from '../public/core.js';
import { Fail, randId } from './util.js';
import { commit } from './db.js';

export const MAX_VIDEOS = 30;
export const videoOut = r => ({ id: r.id, kind: r.kind, ref: r.ref, url: r.url, title: r.title, vertical: !!r.vertical, on: !!r.active, pos: r.pos });
export async function listVideos(db, { all = false } = {}) {
  const q = 'SELECT id, kind, ref, url, title, vertical, pos, active FROM videos' + (all ? '' : ' WHERE active=1') + ' ORDER BY pos, created_at, id';
  return (await db.prepare(q).all()).results.map(videoOut);
}
/* ce que voit le client (jamais d'adresse libre : seulement plateforme + identifiant, l'adresse du lecteur est reconstruite dans le navigateur) */
export const publicVideos = list => list.map(v => ({ id: v.id, kind: v.kind, ref: v.ref, url: v.url, title: v.title, vertical: v.vertical }));

/* Liens courts TikTok (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/…) : on suit la redirection pour trouver l'identifiant.
   Seuls des serveurs tiktok.com sont contactés (jamais une adresse choisie par un tiers). */
export async function resolveTikTok(url) {
  let cur = url;
  for (let i = 0; i < 4; i++) {
    let u; try { u = new URL(cur); } catch (e) { return ''; }
    if (u.protocol !== 'https:' || !/(^|\.)tiktok\.com$/i.test(u.hostname)) return '';
    let res;
    try {
      res = await fetch(u.href, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; ZapBoutique/1.0)', accept: 'text/html' }, signal: AbortSignal.timeout(6000) });
    } catch (e) { return ''; }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      try { cur = new URL(loc, u.href).href; } catch (e) { return ''; }
      const p = parseVideo(cur);
      if (p.ok && p.kind === 'tiktok' && p.ref) return p.ref;
      continue;
    }
    if (res.ok) { // pas de redirection : l'adresse officielle figure parfois dans la page
      const t = (await res.text()).slice(0, 300000);
      const m = /tiktok\.com\/@[\w.\-]+\/(?:video|photo)\/(\d{6,25})/.exec(t);
      if (m) return m[1];
    }
    return '';
  }
  return '';
}

async function recognize(input) {
  const p = parseVideo(input);
  if (!p.ok) throw new Fail(422, p.error || 'Collez le lien de la vidéo.');
  if (p.resolve) {
    const ref = await resolveTikTok(p.url);
    if (!ref) throw new Fail(422, 'Ce lien court TikTok n’a pas pu être lu. Ouvrez la vidéo dans TikTok (ou dans un navigateur), copiez le lien complet de la page (il contient « /video/ ») et collez-le ici.');
    p.ref = ref;
  }
  if (!videoRefOk(p.kind, p.ref)) throw new Fail(422, 'Lien de vidéo non reconnu.');
  return p;
}
const cleanTitle = t => norm(t).slice(0, 80);

export async function addVideo(env, body) {
  const db = env.DB, b = body || {};
  const p = await recognize(b.url);
  const n = (await db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(pos), 0) AS m FROM videos').first()) || { n: 0, m: 0 };
  if (n.n >= MAX_VIDEOS) throw new Fail(409, 'Vous avez atteint le maximum de ' + MAX_VIDEOS + ' vidéos. Supprimez-en une pour en ajouter.');
  if (await db.prepare('SELECT 1 AS x FROM videos WHERE kind=? AND ref=?').bind(p.kind, p.ref).first()) throw new Fail(409, 'Cette vidéo est déjà dans la liste.');
  const id = randId('v');
  try {
    await commit(db, [db.prepare('INSERT INTO videos(id,kind,ref,url,title,vertical,pos,active,created_at) VALUES(?,?,?,?,?,?,?,1,?)')
      .bind(id, p.kind, p.ref, p.url, cleanTitle(b.title), p.vertical ? 1 : 0, n.m + 1, Date.now())]);
  } catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw new Fail(409, 'Cette vidéo est déjà dans la liste.'); throw e; }
  return videoOut(await db.prepare('SELECT id, kind, ref, url, title, vertical, pos, active FROM videos WHERE id=?').bind(id).first());
}

/* titre, affichage dans la boutique, ordre (move: 'up' | 'down') */
export async function patchVideo(env, id, body) {
  const db = env.DB, b = body || {};
  const v = await db.prepare('SELECT id, pos, created_at FROM videos WHERE id=?').bind(id).first();
  if (!v) throw new Fail(404, 'Vidéo introuvable.');
  const st = [];
  if (b.title !== undefined) st.push(db.prepare('UPDATE videos SET title=? WHERE id=?').bind(cleanTitle(b.title), id));
  if (b.on !== undefined) st.push(db.prepare('UPDATE videos SET active=? WHERE id=?').bind(b.on ? 1 : 0, id));
  if (b.move === 'up' || b.move === 'down') {
    const rows = (await db.prepare('SELECT id FROM videos ORDER BY pos, created_at, id').all()).results.map(r => r.id);
    const i = rows.indexOf(id), j = b.move === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < rows.length) { // on renumérote tout : l'ordre reste cohérent même après des suppressions
      [rows[i], rows[j]] = [rows[j], rows[i]];
      rows.forEach((rid, k) => st.push(db.prepare('UPDATE videos SET pos=? WHERE id=?').bind(k + 1, rid)));
    }
  } else if (b.move !== undefined) throw new Fail(400, 'Déplacement invalide.');
  if (st.length) await commit(db, st);
  return videoOut(await db.prepare('SELECT id, kind, ref, url, title, vertical, pos, active FROM videos WHERE id=?').bind(id).first());
}
export async function deleteVideo(env, id) {
  const db = env.DB, r = await db.prepare('DELETE FROM videos WHERE id=?').bind(id).run();
  if (r.meta && r.meta.changes === 0) throw new Fail(404, 'Vidéo introuvable.');
  await commit(db, []);
}
