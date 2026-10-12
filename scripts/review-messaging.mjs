// AI half of the messaging check (CRM item 3; Luke, Oct 11). Chained after
// build-snapshot.mjs in `npm run snapshot`, so it runs on every deploy and
// gets the ANTHROPIC_API_KEY secret through ALL_SECRETS (no workflow edit).
//
// build-snapshot.mjs leaves this week's rep–agent conversations in
// .cache/msg-threads.json (never published). Each conversation not reviewed
// yet goes to Claude with the VPG Texting Standard; the verdict (ok + one
// short reason, no names / numbers / quotes) is kept in
// public/messaging-review.json — carried from deploy to deploy like
// history.json — and each pair's `messaging.ai` = { ok, total, bad } for the
// week is written into public/data.json, where autoCrm (scorecard-lib)
// grades it with the rules.
//
// It never fails the deploy over Claude: no key, an API error or a refusal
// just leaves those conversations for the next run. Only a failed load of
// the published review file aborts (abort, don't wipe — like history.json).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM } from './messaging-standard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data.json');
const OUT = path.join(ROOT, 'public', 'messaging-review.json');
const THREADS = path.join(ROOT, '.cache', 'msg-threads.json');
const PAGES_URL = 'https://vpg-realty.github.io/dashboard/messaging-review.json';
const KEEP_WEEKS = 6;
// Bump when what Claude is shown changes, so earlier verdicts are dropped
// and the conversations re-reviewed (2: workflow texts labelled
// "automated", not "rep" — Oct 12).
const RULES_VERSION = 2;
const PER_CALL = 12;        // conversations per request
const MAX_PER_RUN = 150;    // cost guard: the rest wait for the next run
const REREVIEW_MS = 24 * 3600 * 1000;   // a conversation with new rep texts is looked at again at most daily

export const MODEL = 'claude-opus-5-5';

// The judgment rules Claude is given live in scripts/messaging-standard.mjs
// (also shown on the dashboard under "How the score works").
export { SYSTEM };

const SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ok: { type: 'boolean' },
          issue: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['id', 'ok', 'issue'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
};

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try { return JSON.parse(process.env.ALL_SECRETS || '{}').ANTHROPIC_API_KEY || null; } catch { return null; }
}

async function loadDeployed() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${PAGES_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (!d || d.v !== 1 || !d.weeks) throw new Error('malformed messaging-review.json');
      return d;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    }
  }
  return null;
}

const fmtTime = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

// One request: up to PER_CALL conversations → { threadKey: { ok, issue } }.
export async function reviewBatch(client, batch) {
  const ids = batch.map((_, i) => `c${i + 1}`);
  const body = batch.map((t, i) => `<conversation id="${ids[i]}">\n${t.texts.map((x) => `[${fmtTime(x.at)}] ${x.from}: ${x.body.replace(/\s+/g, ' ')}`).join('\n')}\n</conversation>`).join('\n\n');
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Review these ${batch.length} conversations. Return one verdict per conversation id.\n\n${body}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`refused (${response.stop_details?.category || 'no category'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  const out = {};
  for (const v of parsed.verdicts || []) {
    const i = ids.indexOf(v.id);
    if (i >= 0) out[batch[i].key] = { ok: !!v.ok, issue: v.ok ? null : String(v.issue || 'does not meet the texting standard').slice(0, 140) };
  }
  return { verdicts: out, usage: response.usage };
}

// Verdicts are kept per conversation: { conv: { ok, issue, at, key } }.
const convOf = (key) => key.split(':')[0];

// This week's AI result per pair from the review state.
export function aiSummary(state, weekStart, pairKey, convs) {
  const v = state.weeks?.[weekStart]?.[pairKey] || {};
  const done = convs.filter((c) => v[c]);
  const bad = done.filter((c) => !v[c].ok);
  return { ok: done.length - bad.length, total: done.length, pending: convs.length - done.length, bad: bad.slice(0, 10).map((c) => ({ why: v[c].issue })) };
}

async function main() {
  if (!fs.existsSync(DATA)) { console.log('[messaging-ai] no data.json — skipped'); return; }
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const cache = fs.existsSync(THREADS) ? JSON.parse(fs.readFileSync(THREADS, 'utf8')) : { threads: {} };
  const prev = await loadDeployed();   // throws after 3 tries → the deploy stops instead of wiping verdicts
  const state = prev && prev.rules === RULES_VERSION ? prev : { v: 1, rules: RULES_VERSION, weeks: {} };
  if (prev && prev.rules !== RULES_VERSION) console.log(`[messaging-ai] review rules changed (${prev.rules || 1} → ${RULES_VERSION}): earlier verdicts dropped`);

  // Conversations to review: this run's, not reviewed yet.
  const todo = [];
  for (const p of data.pairs || []) {
    const wk = p.messaging?.weekStart;
    const list = cache.threads?.[`${p.repId}|${p.marketId}`];
    if (!wk || !list) continue;
    const done = state.weeks?.[wk]?.[`${p.repId}|${p.marketId}`] || {};
    for (const t of list) {
      const prevV = done[convOf(t.key)];
      if (!prevV || (prevV.key !== t.key && Date.now() - prevV.at > REREVIEW_MS)) todo.push({ ...t, wk, pairKey: `${p.repId}|${p.marketId}` });
    }
  }

  const key = apiKey();
  let reviewed = 0;
  let failed = 0;
  if (!key) console.log('[messaging-ai] no ANTHROPIC_API_KEY — AI review skipped');
  else if (todo.length) {
    const client = new Anthropic({ apiKey: key, maxRetries: 2 });
    const queue = todo.slice(0, MAX_PER_RUN);
    // Batch by sub-account so each request is one rep's conversations.
    const groups = {};
    for (const t of queue) (groups[t.pairKey] ||= []).push(t);
    let inTok = 0, outTok = 0;
    for (const list of Object.values(groups)) {
      for (let i = 0; i < list.length; i += PER_CALL) {
        const batch = list.slice(i, i + PER_CALL);
        try {
          const { verdicts, usage } = await reviewBatch(client, batch);
          inTok += (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0);
          outTok += usage?.output_tokens || 0;
          for (const t of batch) {
            if (!verdicts[t.key]) continue;
            ((state.weeks[t.wk] ||= {})[t.pairKey] ||= {})[convOf(t.key)] = { ...verdicts[t.key], at: Date.now(), key: t.key };
            reviewed++;
          }
        } catch (err) {
          failed += batch.length;
          console.warn(`[messaging-ai] batch failed (${batch[0].pairKey}): ${String(err?.message || err).slice(0, 200)}`);
        }
      }
    }
    console.log(`[messaging-ai] reviewed ${reviewed} conversation(s), ${failed} left for next run, ${todo.length - queue.length} over the per-run cap · tokens in ${inTok} out ${outTok}`);
  } else console.log('[messaging-ai] nothing new to review');

  // Keep a few weeks.
  const weeks = Object.keys(state.weeks).sort((a, b) => a - b);
  for (const w of weeks.slice(0, Math.max(0, weeks.length - KEEP_WEEKS))) delete state.weeks[w];
  state.updatedAt = new Date().toISOString();

  // Each pair's AI result for the week: the conversations in this run's
  // list, or — when the rules were carried over and there is no list — every
  // conversation reviewed this week.
  for (const p of data.pairs || []) {
    const wk = p.messaging?.weekStart;
    if (!wk) continue;
    const pairKey = `${p.repId}|${p.marketId}`;
    const list = cache.threads?.[pairKey];
    const convs = list ? [...new Set(list.map((t) => convOf(t.key)))] : Object.keys(state.weeks?.[wk]?.[pairKey] || {});
    p.messaging.ai = aiSummary(state, wk, pairKey, convs);
  }

  fs.writeFileSync(OUT, JSON.stringify(state));
  fs.writeFileSync(DATA, JSON.stringify(data));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[messaging-ai] ${err?.message || err}`);
    process.exit(1);
  });
}
