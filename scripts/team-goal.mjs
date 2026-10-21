// "Road to Hawaii" totals for the TV (Luke, Oct 21; src/utils/teamGoal.js):
// reads the tracker's deals from D1, computes them like the site does and
// adds `goal` to public/data.json. Chained after sync-alerts.mjs in `npm run
// snapshot` (the GHL sync has already moved statuses); never fails the
// deploy — without D1 the last deploy's numbers are kept (build-snapshot
// carries `goal` over). Usage: one read of the deals (~300 rows) and two
// settings rows per run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from '../src/deals/math.js';
import { goalTotals } from '../src/utils/teamGoal.js';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data.json');

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) { console.log('[goal] no Cloudflare credentials here — skipped'); return; }
  const query = async (sql) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status} ${JSON.stringify(d.errors || [])}`);
    return d.result[0].results;
  };
  const deals = (await query('SELECT id, data FROM deals WHERE deleted = 0')).map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  const st = Object.fromEntries((await query("SELECT key, value FROM settings WHERE key IN ('deal_rules', 'deal_lists')")).map((r) => [r.key, JSON.parse(r.value)]));
  const totals = goalTotals(deals.map((d) => compute(d, st.deal_rules, st.deal_lists)));
  const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  data.goal = { ...totals, at: new Date().toISOString() };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log(`[goal] closed ${totals.closedN} ($${totals.closed}) · assigned ${totals.linedN} ($${totals.lined})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[goal] failed (deploy continues, last numbers kept): ${err.message}`));
}
