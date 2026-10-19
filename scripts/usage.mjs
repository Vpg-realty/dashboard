// Usage & cost check (Luke, Oct 19: "keep the usage at top of mind … I need
// to ensure that I am not overpaying"). Run it before shipping anything that
// adds a query, a poll or a per-run step, and whenever cost comes up:
//
//   npm run usage            (Claude Code session: api.cloudflare.com via the
//                             network secret; elsewhere CLOUDFLARE_API_TOKEN)
//
// Prints, from Cloudflare's analytics: D1 rows read / written and Pages
// Functions requests per day for the last 7 days, this month so far, a
// 30-day estimate against what the Workers Paid plan ($5/month) includes,
// the estimated bill, the database size, the queries that read the most rows
// today (a new full-table scan shows up here first) and this month's Claude
// spend on the owners' chat (D1 chat_messages). Read only.
const ACCOUNT = 'f9e272074737cc27ea3313dda8917610';
const DB = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';

// Workers Paid, checked Oct 19, 2026 (developers.cloudflare.com/d1/platform/
// pricing, /workers/platform/pricing). Pages Functions count as Workers
// requests.
export const PLAN = {
  base: 5,
  reads: { included: 25e9, per: 1e6, price: 0.001 },
  writes: { included: 50e6, per: 1e6, price: 1.0 },
  requests: { included: 10e6, per: 1e6, price: 0.3 },
  storageGb: { included: 5, price: 0.75 },
};

// Monthly totals → the estimated bill. Pure.
export function estimate({ reads, writes, requests, storageBytes }) {
  const over = (n, p) => Math.max(0, n - p.included) / p.per * p.price;
  const gb = storageBytes / 1e9;
  const parts = {
    base: PLAN.base,
    reads: over(reads, PLAN.reads),
    writes: over(writes, PLAN.writes),
    requests: over(requests, PLAN.requests),
    storage: Math.max(0, gb - PLAN.storageGb.included) * PLAN.storageGb.price,
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
const pct = (n, of) => `${((n / of) * 100).toFixed(n / of < 0.01 ? 3 : 1)}%`;
const ymd = (d) => d.toISOString().slice(0, 10);

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = process.env.CLOUDFLARE_API_TOKEN || secrets.CLOUDFLARE_API_TOKEN;
  const headers = { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const now = new Date();
  const monthStart = `${ymd(now).slice(0, 8)}01`;
  const weekAgo = ymd(new Date(now.getTime() - 6 * 86400000));
  const from = weekAgo < monthStart ? weekAgo : monthStart;
  const today = ymd(now);

  const gql = async (query) => {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers, body: JSON.stringify({ query }) });
    const d = await r.json();
    if (d.errors?.length) throw new Error(JSON.stringify(d.errors).slice(0, 300));
    return d.data.viewer.accounts[0];
  };
  const a = await gql(`query { viewer { accounts(filter:{accountTag:"${ACCOUNT}"}) {
    d1: d1AnalyticsAdaptiveGroups(limit: 60, filter:{date_geq:"${from}", databaseId:"${DB}"}, orderBy:[date_ASC]) { sum { rowsRead rowsWritten } dimensions { date } }
    fn: pagesFunctionsInvocationsAdaptiveGroups(limit: 60, filter:{date_geq:"${from}"}, orderBy:[date_ASC]) { sum { requests errors } dimensions { date } }
    size: d1StorageAdaptiveGroups(limit: 1, filter:{date_geq:"${weekAgo}", databaseId:"${DB}"}, orderBy:[date_DESC]) { max { databaseSizeBytes } dimensions { date } }
    top: d1QueriesAdaptiveGroups(limit: 5, filter:{date_geq:"${today}", databaseId:"${DB}"}, orderBy:[sum_rowsRead_DESC]) { sum { rowsRead } count dimensions { query } }
  } } }`);

  const days = {};
  for (const r of a.d1) days[r.dimensions.date] = { reads: r.sum.rowsRead, writes: r.sum.rowsWritten, requests: 0, errors: 0 };
  for (const r of a.fn) {
    const d = (days[r.dimensions.date] ||= { reads: 0, writes: 0, requests: 0, errors: 0 });
    d.requests = r.sum.requests; d.errors = r.sum.errors;
  }
  console.log('Day         D1 reads   D1 writes  Requests  (errors)');
  for (const date of Object.keys(days).sort()) {
    if (date < weekAgo) continue;
    const d = days[date];
    console.log(`${date}  ${fmt(d.reads).padStart(9)}  ${fmt(d.writes).padStart(9)}  ${fmt(d.requests).padStart(8)}  ${d.errors ? `(${d.errors})` : ''}`);
  }

  // This month so far, and a 30-day estimate from the last 7 full days (today
  // is partial, so it's left out of the rate).
  const mtd = { reads: 0, writes: 0, requests: 0 };
  for (const [date, d] of Object.entries(days)) if (date >= monthStart) for (const k of Object.keys(mtd)) mtd[k] += d[k];
  const full = Object.keys(days).filter((d) => d >= weekAgo && d < today);
  const rate = { reads: 0, writes: 0, requests: 0 };
  for (const date of full) for (const k of Object.keys(rate)) rate[k] += days[date][k] / Math.max(1, full.length);
  const month = { reads: rate.reads * 30, writes: rate.writes * 30, requests: rate.requests * 30 };
  const storageBytes = a.size[0]?.max.databaseSizeBytes || 0;
  console.log(`\nThis month so far: ${fmt(mtd.reads)} reads · ${fmt(mtd.writes)} writes · ${fmt(mtd.requests)} requests`);
  console.log(`30-day estimate (avg of ${full.length} full days):`);
  console.log(`  D1 reads     ${fmt(month.reads).padStart(8)} of ${fmt(PLAN.reads.included)} included (${pct(month.reads, PLAN.reads.included)})`);
  console.log(`  D1 writes    ${fmt(month.writes).padStart(8)} of ${fmt(PLAN.writes.included)} included (${pct(month.writes, PLAN.writes.included)})`);
  console.log(`  Requests     ${fmt(month.requests).padStart(8)} of ${fmt(PLAN.requests.included)} included (${pct(month.requests, PLAN.requests.included)})`);
  console.log(`  D1 storage   ${(storageBytes / 1e6).toFixed(1)} MB of ${PLAN.storageGb.included} GB included`);
  const bill = estimate({ ...month, storageBytes });
  console.log(`Estimated Cloudflare bill: $${bill.total.toFixed(2)}/month ($${PLAN.base} plan${bill.total > PLAN.base ? ` + $${(bill.total - PLAN.base).toFixed(2)} over` : ', nothing over'})`);

  console.log('\nMost rows read today (watch for full-table scans):');
  for (const q of a.top) console.log(`  ${fmt(q.sum.rowsRead).padStart(8)} rows · ${String(q.count).padStart(5)} runs · ${q.dimensions.query.replace(/\s+/g, ' ').slice(0, 110)}`);

  // Claude: the owners' chat logs its cost per answer; the build's messaging
  // review and lead spotting don't log theirs (Anthropic console → Usage).
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
      method: 'POST', headers,
      body: JSON.stringify({ sql: 'SELECT ROUND(COALESCE(SUM(cost), 0), 2) AS spent, COUNT(cost) AS answers FROM chat_messages WHERE at >= ?', params: [monthStart] }),
    });
    const row = (await r.json()).result?.[0]?.results?.[0];
    if (row) console.log(`\nClaude chat this month: $${row.spent} over ${row.answers} answers (cap in settings chat_cap). Messaging review / lead spotting: see the Anthropic console.`);
  } catch { /* chat table missing */ }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => { console.error(`[usage] ${e.message}`); process.exit(1); });
}
