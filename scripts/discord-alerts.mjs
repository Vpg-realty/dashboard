// Alerts into the team's Discord (Luke, Oct 15). Chained after
// sync-deals.mjs in `npm run snapshot`, so it runs every deploy (~15 min).
// Posts to the channel behind the repo secret DISCORD_WEBHOOK_URL (via
// ALL_SECRETS; never printed). Each alert goes out once — what was sent is
// kept in D1 settings 'discord_sent' ({key: time}, 21 days). The very first
// run only records what's already true, so turning alerts on doesn't flood
// the channel. Never fails the deploy.
//
// Alerts (planAlerts, pure — tested on its own):
//   - New contract: a GHL deal whose startedAt (first seen under contract,
//     server/stickyCounts.js) is within the last 2 hours.
//   - Closed: a GHL deal in Closed whose stage changed in the last 24 hours.
//   - IP ending: a pending tracker deal with no buyer whose IP / DD ends
//     within 24 hours (ddTime.js ipEndAlert) — once per end date.
//   - TC morning list: weekdays from 7:30am Arizona (until noon): closings
//     in the next 3 days, EMD pending with no payer, deals missing info.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipEndAlert } from '../src/deals/ddTime.js';
import { needsInfo } from '../src/deals/required.js';
import { isOpen } from '../src/deals/math.js';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a'; // same database as sync-deals.mjs
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://vpg-dashboard.pages.dev';
const KEEP_MS = 21 * 86_400_000;
const COLOR = { contract: 0x2b6cb0, closed: 0x23a55a, ip: 0xda373c, tc: 0xad9b7a };

const azDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(ms));
const azClock = (ms) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date(ms)); const g = (t) => p.find((x) => x.type === t)?.value; return { day: g('weekday'), mins: (+g('hour') % 24) * 60 + +g('minute') }; };
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const short = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');
const money = (n) => (typeof n === 'number' && n > 0 ? `$${Math.round(n).toLocaleString('en-US')}` : null);
const field = (name, value) => ({ name, value: String(value || '—'), inline: true });

// → [{ key, embed }]
export function planAlerts({ pairs = [], deals = [], names = {}, now = Date.now() }) {
  const out = [];
  const today = azDate(now);
  const rep = (id) => names.rep?.[id] || id;
  for (const p of pairs) {
    for (const d of p.deals || []) {
      const where = d.address || d.name || 'A deal';
      if (d.startedAt && now - d.startedAt >= 0 && now - d.startedAt <= 2 * 3_600_000) {
        out.push({ key: `contract:${d.id}`, embed: {
          title: `${rep(p.repId)} got one under contract`, description: `${where} · ${p.marketId}`, color: COLOR.contract,
          fields: [field('IP end', short(d.ipEnd)), field('COE', short(d.coe)), field('Rep', rep(p.repId))], url: `${SITE}/pipeline`,
        } });
      }
      if (d.stage === 'closed' && d.stageSince && now - d.stageSince >= 0 && now - d.stageSince <= 24 * 3_600_000) {
        out.push({ key: `closed:${d.id}`, embed: {
          title: `🎉 Closed${money(d.value) ? ` · ${money(d.value)}` : ''}`, description: `${where} · ${p.marketId}`, color: COLOR.closed,
          fields: [field('Rep', rep(p.repId)), field('COE', short(d.coe))], url: `${SITE}/pipeline`,
        } });
      }
    }
  }
  for (const d of deals) {
    const ip = ipEndAlert(d, now);
    if (ip && ip.hours <= 24) {
      out.push({ key: `ip:${d.id}:${d.ddEnd}`, embed: {
        title: `IP ends in ${Math.max(1, Math.round(ip.hours))}h — no buyer yet`, description: `${d.address}\nFind a buyer or cancel before the inspection period ends.`, color: COLOR.ip,
        fields: [field('Ends', `${new Date(ip.at).toLocaleString('en-US', { timeZone: 'America/Phoenix', weekday: 'short', hour: 'numeric', minute: '2-digit' })} AZ`), field('Acq.', d.acq)],
        url: `${SITE}/deals/active?deal=${encodeURIComponent(d.id)}`,
      } });
    }
  }
  const { day, mins } = azClock(now);
  if (!['Sat', 'Sun'].includes(day) && mins >= 7 * 60 + 30 && mins < 12 * 60) {
    const open = deals.filter(isOpen);
    const closing = open.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.coe || '') && d.coe >= today && d.coe <= addDays(today, 3));
    const emd = open.filter((d) => String(d.emdStatus || '').toUpperCase() === 'PENDING' && !d.emdPaidBy);
    const need = open.filter((d) => needsInfo(d, { owner: false, readOnly: false }, today).length > 0);
    const lines = [
      ...closing.map((d) => `• Closing ${short(d.coe)} — ${d.address}${d.title ? '' : ' (no title agency on file)'}`),
      ...emd.map((d) => `• EMD pending, no payer — ${d.address}`),
    ];
    out.push({ key: `tc:${today}`, embed: {
      title: `TC list · ${new Date(now).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', month: 'short', day: 'numeric' })}`,
      description: (lines.length ? lines.slice(0, 15).join('\n') + (lines.length > 15 ? `\n…and ${lines.length - 15} more` : '') : 'Nothing closing in the next 3 days and no EMD problems.'),
      color: COLOR.tc,
      fields: [field('Closing ≤ 3 days', closing.length), field('EMD issues', emd.length), field('Missing info', need.length)],
      url: `${SITE}/deals/active`,
    } });
  }
  return out;
}

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const hook = secrets.DISCORD_WEBHOOK_URL;
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!hook) { console.log('[discord] no DISCORD_WEBHOOK_URL secret — skipped'); return; }
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(hook)) { console.log('[discord] DISCORD_WEBHOOK_URL is not a Discord webhook link — skipped'); return; }
  if (!token || !account) { console.log('[discord] no Cloudflare credentials here — skipped'); return; }
  const query = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(params ? { sql, params } : { sql }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status}`);
    return d.result[0]?.results || [];
  };
  const dataFile = path.join(ROOT, 'public', 'data.json');
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : {};
  const pairs = data.pairs || [];
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8'));
  const names = { rep: Object.fromEntries(cfg.reps.map((r) => [r.id, r.name])) };
  const deals = (await query('SELECT id, data FROM deals WHERE deleted = 0')).map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  const row = (await query("SELECT value FROM settings WHERE key = 'discord_sent'"))[0];
  const first = !row;
  const sent = row ? JSON.parse(row.value) : {};
  const now = Date.now();
  for (const [k, t] of Object.entries(sent)) if (now - t > KEEP_MS) delete sent[k];
  const due = planAlerts({ pairs, deals, names, now }).filter((a) => !sent[a.key]);
  let posted = 0;
  for (const a of due) {
    if (!first) {
      const r = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'VPG Dashboard', embeds: [a.embed], allowed_mentions: { parse: [] } }) });
      if (!r.ok) { console.warn(`[discord] post refused (${r.status}) — will retry next run`); break; }
      posted++;
      await new Promise((res) => setTimeout(res, 700));
    }
    sent[a.key] = now;
  }
  await query("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('discord_sent', ?, ?, 'Discord alerts') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(sent), new Date(now).toISOString()]);
  console.log(first ? `[discord] first run: ${due.length} current alert(s) recorded, none posted` : `[discord] ${posted} alert(s) posted`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[discord] failed (deploy continues): ${err.message}`));
}
