// Google reviews (Luke, Nov 4: "pull in all reviews we got for the month and
// then assign them to an individual who got the review. most people mention
// names in the review so that would automatically assign the owner … $20 per
// review, up to 5 reviews per month … once a rep is assigned … a new payment
// to approve and then be marked as paid"). Google's reviews can't be read
// through GHL's API, so an owner pastes the month's reviews from Google;
// Claude splits the paste into reviews and picks the reps each one names.
// Every assigned review (up to REVIEW_CAP a rep a month, $REVIEW_PAY each,
// a review naming two reps pays both) is a bonus line in Finance
// (fin_bonuses kind 'review', edge/finance.js) — approve, then mark paid.
// D1 `reviews` made on first use. Owners only (functions/api/reviews).
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, costOf, monthStart, DEFAULT_CAP } from './chat.js';
import { ensure as ensureFinance, loadAll, bonusStatements } from './finance.js';
import { REVIEW_PAY, reviewPays } from '../src/reviews/rules.js';
import roster from '../subaccounts.json' with { type: 'json' };

const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
export const MAX_PASTE = 60000;

let made = false;
export async function ensure(db) {
  if (made) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, month TEXT NOT NULL, author TEXT, rating INTEGER, posted_on TEXT, text TEXT,
      reps TEXT NOT NULL DEFAULT '[]', claude TEXT, why TEXT, added_by TEXT, added_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS reviews_month ON reviews (month)'),
  ]);
  made = true;
  await ensureFinance(db);
}

const parse = (r) => ({ ...r, reps: JSON.parse(r.reps || '[]'), claude: JSON.parse(r.claude || '[]') });

// The reps a review can go to: everyone on the board who isn't inactive.
export async function people(db) {
  const users = (await db.prepare('SELECT name, last_name, rep_id, status FROM users WHERE rep_id IS NOT NULL').all()).results;
  const off = new Set(users.filter((u) => u.status === 'inactive').map((u) => u.rep_id));
  return (roster.reps || []).filter((r) => !off.has(r.id)).map((r) => ({ repId: r.id, name: r.name, color: r.color }));
}
const nameOf = (list, id) => list.find((p) => p.repId === id)?.name || (roster.reps || []).find((r) => r.id === id)?.name || id;

export async function load(db, month) {
  await ensure(db);
  const [rows, months, list] = await Promise.all([
    db.prepare('SELECT * FROM reviews WHERE month = ? ORDER BY posted_on, added_at').bind(month).all(),
    db.prepare('SELECT month, COUNT(*) n FROM reviews GROUP BY month ORDER BY month DESC').all(),
    people(db),
  ]);
  return { month, reviews: rows.results.map(parse), months: months.results, people: list };
}

// The statements that bring a month's review bonuses in line with its
// reviews (as they'll stand after this change).
export async function syncStatements(db, month, reviews, list, user, now) {
  const all = await loadAll(db);
  const pays = reviewPays(reviews);
  const want = [];
  for (const r of reviews) {
    for (const rep of r.reps) {
      if (!pays.get(`${r.id}:${rep}`)) continue;
      want.push({ ref: `review:${r.id}:${rep}`, kind: 'review', repId: rep, who: nameOf(list, rep), amount: REVIEW_PAY, note: `Google review · ${r.author || 'no name'}`, on: r.posted_on || null });
    }
  }
  return bonusStatements(all, month, ['review'], want, user, now);
}

async function idFor(author, text) {
  const norm = `${String(author || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${String(text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300)}`;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return `r${[...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// --- Claude reads the paste -----------------------------------------------------
const SYSTEM = (list) => `You read Google reviews of Valley Property Group (VPG), a real-estate wholesaling company, pasted by an owner from Google. Split the paste into the separate reviews and, for each, say which VPG team members it names.
- author: the reviewer's name as shown.
- rating: the stars (1-5), 0 when the paste doesn't show them.
- date: the review's date as YYYY-MM-DD only when the paste states an actual date; '' for relative dates like "2 weeks ago" or none.
- text: the review's own words. Leave out Google's page furniture (Like, Share, "More", photos counts, "Local Guide · 12 reviews") and any "Response from the owner" — that's VPG's reply, not the review.
- reps: the team members the review names or clearly refers to, by their id from the list below — first names, last names, nicknames and misspellings count ("Danny" = Danni). A name that isn't on the list, or a first name two team members share with nothing to tell them apart, isn't assigned. [] when no one is named.
- why: under 12 words — the name the review used, or why no one was assigned.
A review with no text (stars only) is still a review: text '', reps [].
The team:
${list.map((p) => `- ${p.repId}: ${p.name}`).join('\n')}`;

const SCHEMA = {
  type: 'object',
  properties: {
    reviews: { type: 'array', items: { type: 'object', properties: {
      author: { type: 'string' }, rating: { type: 'integer' }, date: { type: 'string' }, text: { type: 'string' },
      reps: { type: 'array', items: { type: 'string' } }, why: { type: 'string' },
    }, required: ['author', 'rating', 'date', 'text', 'reps', 'why'], additionalProperties: false } },
  },
  required: ['reviews'],
  additionalProperties: false,
};

export async function overCap(db) {
  const spent = (await db.prepare('SELECT COALESCE(SUM(cost), 0) s FROM chat_messages WHERE at >= ?').bind(monthStart()).first())?.s || 0;
  const capRow = await db.prepare("SELECT value FROM settings WHERE key = 'chat_cap'").first();
  return spent >= (capRow ? Number(JSON.parse(capRow.value)) : DEFAULT_CAP);
}

export async function readPaste(env, text, list) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM(list),
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `The paste:\n\n${text}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error("Claude couldn't read this paste");
  if (res.stop_reason === 'max_tokens') throw new Error('That paste is too long — add the reviews in two parts');
  const out = JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const ids = new Set(list.map((p) => p.repId));
  const reviews = (out.reviews || []).map((r) => ({
    author: clip(r.author, 120), rating: Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 ? r.rating : null,
    date: DAY.test(r.date || '') ? r.date : null, text: clip(r.text, 4000),
    reps: [...new Set((r.reps || []).filter((x) => ids.has(x)))], why: clip(r.why, 120),
  })).filter((r) => r.author || r.text);
  return { reviews, usage: res.usage || {}, cost: costOf(res.usage || {}) };
}

// One action → { run: [[sql, args]], months: [months to re-sync], detail } or { error }.
export async function act(env, db, user, b, now) {
  await ensure(db);
  const list = await people(db);
  const ids = new Set(list.map((p) => p.repId));
  const cleanReps = (x) => (Array.isArray(x) ? [...new Set(x.map(String).filter((r) => ids.has(r)))] : null);
  if (b.action === 'paste') {
    const month = String(b.month || '');
    const text = String(b.text || '').trim();
    if (!MONTH.test(month)) return { error: 'pick the month these reviews are for' };
    if (text.length < 10) return { error: 'paste the reviews first' };
    if (text.length > MAX_PASTE) return { error: 'that paste is too long — add the reviews in two parts' };
    if (!env.ANTHROPIC_API_KEY) return { error: 'Claude is not set up on the site yet' };
    if (await overCap(db)) return { error: "This month's Claude budget is used up — raise it on the Territory chat or add the reviews one at a time" };
    const got = await readPaste(env, text, list);
    const have = new Set((await db.prepare('SELECT id FROM reviews').all()).results.map((r) => r.id));
    const run = [];
    let added = 0;
    let skipped = 0;
    const seen = new Set();
    for (const r of got.reviews) {
      const id = await idFor(r.author, r.text);
      if (have.has(id) || seen.has(id)) { skipped++; continue; }
      seen.add(id);
      // A review keeps the month picked; an actual date in another month wins.
      const mo = r.date ? r.date.slice(0, 7) : month;
      run.push(['INSERT INTO reviews (id, month, author, rating, posted_on, text, reps, claude, why, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, mo, r.author, r.rating, r.date, r.text, JSON.stringify(r.reps), JSON.stringify(r.reps), r.why, user.name, now]]);
      added++;
    }
    run.push(['INSERT INTO chat_messages (thread, role, text, name, email, at, usage, cost, tools) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['reviews', 'assistant', `Read ${got.reviews.length} reviews for ${month}`, user.name, user.email, now, JSON.stringify(got.usage), got.cost, null]]);
    return { run, months: [...new Set([month, ...got.reviews.filter((r) => r.date).map((r) => r.date.slice(0, 7))])], detail: { month, read: got.reviews.length, added, skipped }, added, skipped };
  }
  if (b.action === 'add') {
    const month = String(b.month || '');
    if (!MONTH.test(month)) return { error: 'pick the month' };
    const author = clip(b.author, 120);
    const text = clip(b.text, 4000);
    if (!author && !text) return { error: 'enter who wrote it or what it says' };
    const posted = DAY.test(b.posted_on || '') ? b.posted_on : null;
    const reps = cleanReps(b.reps) || [];
    const id = await idFor(author, text);
    if (await db.prepare('SELECT id FROM reviews WHERE id = ?').bind(id).first()) return { error: 'that review is already on the list' };
    return { run: [['INSERT INTO reviews (id, month, author, rating, posted_on, text, reps, claude, why, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, posted ? posted.slice(0, 7) : month, author, null, posted, text, JSON.stringify(reps), '[]', 'added by hand', user.name, now]]], months: [posted ? posted.slice(0, 7) : month], detail: { id, author } };
  }
  const r = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(String(b.id || '')).first();
  if (!r) return { error: 'that review is gone' };
  if (b.action === 'edit') {
    const reps = cleanReps(b.reps);
    const month = b.month == null ? r.month : String(b.month);
    if (!reps) return { error: 'pick who it goes to' };
    if (!MONTH.test(month)) return { error: 'pick the month' };
    return { run: [['UPDATE reviews SET reps = ?, month = ?, updated_by = ?, updated_at = ? WHERE id = ?', [JSON.stringify(reps), month, user.name, now, r.id]]],
      months: [...new Set([r.month, month])], detail: { id: r.id, reps, month }, change: { id: r.id, reps, month } };
  }
  if (b.action === 'remove') {
    return { run: [['DELETE FROM reviews WHERE id = ?', [r.id]]], months: [r.month], detail: { id: r.id, author: r.author }, change: { id: r.id, gone: true } };
  }
  return { error: 'unknown action' };
}

// After an action: the review bonuses of the months it touched, as the
// reviews will stand. → statements or { error } (an approved / paid
// review payment can't be taken away here).
export async function syncAfter(db, p, list, user, now) {
  const st = [];
  for (const month of p.months || []) {
    let rows = (await db.prepare('SELECT * FROM reviews WHERE month = ?').bind(month).all()).results.map(parse);
    if (p.change) {
      rows = rows.filter((x) => x.id !== p.change.id);
      if (!p.change.gone && p.change.month === month) {
        const cur = (await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(p.change.id).first());
        rows.push({ ...parse(cur), reps: p.change.reps, month });
      }
    }
    // New reviews from this action aren't in D1 yet: the statements insert
    // them first, so read them from the run.
    for (const [sql, args] of p.run) {
      if (!sql.startsWith('INSERT INTO reviews') || args[1] !== month) continue;
      rows.push({ id: args[0], month, author: args[2], posted_on: args[4], reps: JSON.parse(args[6]), added_at: now });
    }
    const s = await syncStatements(db, month, rows, list, user, now);
    if (s.error) return s;
    st.push(...s.statements);
  }
  return { statements: st };
}
