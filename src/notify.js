/* Alertes « nouvelle commande » sur le téléphone du vendeur, même application fermée.
   Deux services au choix (ou les deux) : Telegram et ntfy. Le message ne contient AUCUNE donnée personnelle du client. */
export const channels = env => ({
  telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  ntfy: !!(env.NTFY_TOPIC && /^[A-Za-z0-9_-]{1,64}$/.test(env.NTFY_TOPIC))
});
const ascii = s => String(s).replace(/[^\x20-\x7e]/g, '');

export async function notify(env, { title, text, url }) {
  const ch = channels(env), jobs = [], out = { telegram: null, ntfy: null };
  if (ch.telegram) {
    jobs.push((async () => {
      const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(env.TELEGRAM_BOT_TOKEN)}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `${title}\n${text}${url ? '\n' + url : ''}`, disable_web_page_preview: true })
      });
      out.telegram = r.ok;
      if (!r.ok) console.error('Telegram refusé', r.status);
    })().catch(e => { out.telegram = false; console.error('Telegram injoignable', e && e.message); }));
  }
  if (ch.ntfy) {
    jobs.push((async () => {
      const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
      const headers = { Title: ascii(title) || 'Commande', Priority: 'high', Tags: 'shopping_cart' };
      if (url) headers.Click = url;
      if (env.NTFY_TOKEN) headers.Authorization = 'Bearer ' + env.NTFY_TOKEN;
      const r = await fetch(`${server}/${env.NTFY_TOPIC}`, { method: 'POST', headers, body: text });
      out.ntfy = r.ok;
      if (!r.ok) console.error('ntfy refusé', r.status);
    })().catch(e => { out.ntfy = false; console.error('ntfy injoignable', e && e.message); }));
  }
  await Promise.all(jobs);
  return out;
}
