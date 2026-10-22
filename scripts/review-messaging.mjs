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
import { SYSTEM, REPLY_SYSTEM, COACH_SYSTEM } from './messaging-standard.mjs';
import { fetchState } from './state-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data.json');
const OUT = path.join(ROOT, 'public', 'messaging-review.json');
const THREADS = path.join(ROOT, '.cache', 'msg-threads.json');
const KEEP_WEEKS = 6;
// Bump when what Claude is shown changes, so earlier verdicts are dropped
// and the conversations re-reviewed (2: workflow texts labelled
// "automated", not "rep" — Oct 12; 3: never hold automated texts against
// the rep — Oct 12).
const RULES_VERSION = 3;
const PER_CALL = 12;        // conversations per request
const MAX_PER_RUN = 150;    // cost guard: the rest wait for the next run
const REREVIEW_MS = 24 * 3600 * 1000;
const REPLY_PER_CALL = 25;     // unanswered agent texts per request
const REPLY_MAX_PER_RUN = 300;   // a conversation with new rep texts is looked at again at most daily
// Weekly coaching (Luke, Oct 22: "an AI overview of the top 3 things you can
// improve on based on messaging that week"): per rep, at most once a day,
// and only when there is something new to read.
const COACH_EVERY_MS = 20 * 3600 * 1000;
const COACH_THREADS = 25;   // conversations shown to Claude per rep

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
      const r = await fetchState('messaging-review.json');
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
  return { ok: done.length - bad.length, total: done.length, pending: convs.length - done.length, bad: bad.slice(0, 10).map((c) => ({ why: v[c].issue, conv: c })) };
}

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, needs_reply: { type: 'boolean' } },
        required: ['id', 'needs_reply'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

// One request: up to REPLY_PER_CALL unanswered agent texts → { msgId: bool }.
export async function judgeReplies(client, batch) {
  const ids = batch.map((_, i) => `m${i + 1}`);
  const body = batch.map((t, i) => `<item id="${ids[i]}">\n${t.texts.map((x) => `[${fmtTime(x.at)}] ${x.from}: ${x.body.replace(/\s+/g, ' ')}`).join('\n')}\n</item>`).join('\n\n');
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: REPLY_SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
    messages: [{ role: 'user', content: `For each of these ${batch.length} items, does the last agent text need an answer?\n\n${body}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`refused (${response.stop_details?.category || 'no category'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens');
  const parsed = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const out = {};
  for (const v of parsed.items || []) {
    const i = ids.indexOf(v.id);
    if (i >= 0) out[batch[i].id] = !!v.needs_reply;
  }
  return { verdicts: out, usage: response.usage };
}

const COACH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          count: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        },
        required: ['title', 'detail', 'count'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

// One rep's week → up to three things to work on: { items: [{ title,
// detail, count }] }. Shown on the rep's CRM Scores (managers) and My
// Scorecard (the rep).
export async function coachRep(client, { stats, issues, threads }) {
  const pct = (o) => (o?.total ? `${o.ok} of ${o.total} (${Math.round((100 * o.ok) / o.total)}%)` : 'none');
  const body = [
    [
      '<numbers>',
      `Rep texts ending in a question: ${pct(stats.questions)} · team standard 40%`,
      `Texts clear of Never-send / quiet hours / STOP: ${pct(stats.compliance)} · standard 90%`,
      `Agent texts answered within 15 minutes: ${pct(stats.speed)} · standard 75%`,
      `Conversations meeting the texting standard (AI review): ${pct(stats.ai)} · standard 50%`,
      '</numbers>',
    ].join('\n'),
    issues.length ? `<review_findings>\n${issues.map((x) => `- ${x}`).join('\n')}\n</review_findings>` : '<review_findings>none</review_findings>',
    ...threads.map((t, i) => `<conversation id="c${i + 1}">\n${t.texts.map((x) => `[${fmtTime(x.at)}] ${x.from}: ${x.body.replace(/\s+/g, ' ')}`).join('\n')}\n</conversation>`),
  ].join('\n\n');
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: COACH_SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: COACH_SCHEMA } },
    messages: [{ role: 'user', content: `This rep's texting this week. Give the top 3 things to improve.\n\n${body}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`refused (${response.stop_details?.category || 'no category'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens');
  const parsed = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const items = (parsed.items || []).slice(0, 3).map((x) => ({
    title: String(x.title || '').slice(0, 80),
    detail: String(x.detail || '').slice(0, 400),
    count: Number.isInteger(x.count) && x.count > 0 ? x.count : null,
  })).filter((x) => x.title);
  return { items, usage: response.usage };
}

async function main() {
  if (!fs.existsSync(DATA)) { console.log('[messaging-ai] no data.json — skipped'); return; }
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const cache = fs.existsSync(THREADS) ? JSON.parse(fs.readFileSync(THREADS, 'utf8')) : { threads: {} };
  const prev = await loadDeployed();   // throws after 3 tries → the deploy stops instead of wiping verdicts
  const state = prev && prev.rules === RULES_VERSION ? prev : { v: 1, rules: RULES_VERSION, weeks: {}, needs: prev?.needs || {}, coach: prev?.coach || {} };
  state.needs ||= {};
  state.coach ||= {};   // { week: { repId: { at, sig, items } } }   // { week: { pairKey: { msgId: { needs, at } } } } — did an unanswered agent text need an answer
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

  // Unanswered agent texts: did they need an answer? (Luke, Oct 12.) Each
  // is judged once; "no" takes it out of the speed count.
  const replyTodo = [];
  for (const p of data.pairs || []) {
    const wk = p.messaging?.weekStart;
    const pairKey = `${p.repId}|${p.marketId}`;
    const list = cache.misses?.[pairKey];
    if (!wk || !list) continue;
    const done = state.needs?.[wk]?.[pairKey] || {};
    for (const m of list) if (!done[m.id]) replyTodo.push({ ...m, wk, pairKey });
  }
  if (key && replyTodo.length) {
    const client = new Anthropic({ apiKey: key, maxRetries: 2 });
    const queue = replyTodo.slice(0, REPLY_MAX_PER_RUN);
    let judged = 0, inTok = 0, outTok = 0;
    for (let i = 0; i < queue.length; i += REPLY_PER_CALL) {
      const batch = queue.slice(i, i + REPLY_PER_CALL);
      try {
        const { verdicts, usage } = await judgeReplies(client, batch);
        inTok += (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0);
        outTok += usage?.output_tokens || 0;
        for (const m of batch) {
          if (verdicts[m.id] === undefined) continue;
          ((state.needs[m.wk] ||= {})[m.pairKey] ||= {})[m.id] = { needs: verdicts[m.id], at: Date.now() };
          judged++;
        }
      } catch (err) {
        console.warn(`[messaging-ai] reply batch failed: ${String(err?.message || err).slice(0, 200)}`);
      }
    }
    console.log(`[messaging-ai] judged ${judged} unanswered agent text(s), ${replyTodo.length - queue.length} over the per-run cap · tokens in ${inTok} out ${outTok}`);
  }

  // Each pair's AI result for the week: the conversations in this run's
  // list, or — when the rules were carried over and there is no list — every
  // conversation reviewed this week. Then the weekly coaching per rep, which
  // reads it.
  for (const p of data.pairs || []) {
    const wk = p.messaging?.weekStart;
    if (!wk) continue;
    const pairKey = `${p.repId}|${p.marketId}`;
    const list = cache.threads?.[pairKey];
    const convs = list ? [...new Set(list.map((t) => convOf(t.key)))] : Object.keys(state.weeks?.[wk]?.[pairKey] || {});
    p.messaging.ai = aiSummary(state, wk, pairKey, convs);
  }
  if (key) await coachAll(new Anthropic({ apiKey: key, maxRetries: 2 }), data, cache, state);

  // Keep a few weeks.
  for (const store of [state.weeks, state.needs, state.coach]) {
    const weeks = Object.keys(store).sort((a, b) => a - b);
    for (const w of weeks.slice(0, Math.max(0, weeks.length - KEEP_WEEKS))) delete store[w];
  }
  state.updatedAt = new Date().toISOString();

  // The top 3 and the speed exclusions onto each pair.
  for (const p of data.pairs || []) {
    const wk = p.messaging?.weekStart;
    if (!wk) continue;
    const pairKey = `${p.repId}|${p.marketId}`;
    const coach = state.coach?.[wk]?.[p.repId];
    p.messaging.coach = coach?.items?.length ? { at: coach.at, items: coach.items } : null;
    // Speed: unanswered agent texts Claude judged as not needing an answer
    // come out of the count (scorecard-lib speedCounts); not judged yet =
    // still counted.
    if (p.messaging.speed?.missIds) {
      const needs = state.needs?.[wk]?.[pairKey] || {};
      p.messaging.speed.notNeeded = p.messaging.speed.missIds.filter((id) => needs[id]?.needs === false);
      p.messaging.speed.unjudged = p.messaging.speed.missIds.filter((id) => !needs[id]).length;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(state));
  fs.writeFileSync(DATA, JSON.stringify(data));
}

// The weekly coaching, per rep (all their sub-accounts together): asked
// again only when it's 20 h old and the week has new conversations or
// verdicts since (`sig`).
async function coachAll(client, data, cache, state) {
  const reps = {};
  for (const p of data.pairs || []) {
    const wk = p.messaging?.weekStart;
    if (!wk || !p.messaging?.speed) continue;
    (reps[p.repId] ||= { wk, pairs: [] }).pairs.push(p);
  }
  let asked = 0, inTok = 0, outTok = 0;
  for (const [repId, { wk, pairs }] of Object.entries(reps)) {
    const threads = pairs.flatMap((p) => cache.threads?.[`${p.repId}|${p.marketId}`] || []);
    const add = (f) => pairs.reduce((a, p) => ({ ok: a.ok + (f(p)?.ok || 0), total: a.total + (f(p)?.total || 0) }), { ok: 0, total: 0 });
    const stats = { questions: add((p) => p.messaging.questions), compliance: add((p) => p.messaging.compliance), speed: add((p) => p.messaging.speed), ai: add((p) => p.messaging.ai) };
    const issues = pairs.flatMap((p) => (p.messaging.ai?.bad || []).map((b) => b.why)).concat(pairs.flatMap((p) => (p.messaging.compliance?.bad || []).filter((b) => !b.auto).map((b) => b.why))).slice(0, 30);
    if (!threads.length && !issues.length) continue;
    const sig = `${threads.length}:${stats.ai.total}:${stats.questions.total}:${stats.compliance.total}`;
    const had = state.coach[wk]?.[repId];
    if (had && (had.sig === sig || Date.now() - had.at < COACH_EVERY_MS)) continue;
    try {
      const { items, usage } = await coachRep(client, { stats, issues, threads: threads.slice(-COACH_THREADS) });
      inTok += (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0);
      outTok += usage?.output_tokens || 0;
      if (items.length) ((state.coach[wk] ||= {})[repId] = { at: Date.now(), sig, items });
      asked++;
    } catch (err) {
      console.warn(`[messaging-ai] coaching failed (${repId}): ${String(err?.message || err).slice(0, 200)}`);
    }
  }
  if (asked) console.log(`[messaging-ai] weekly top 3 for ${asked} rep(s) · tokens in ${inTok} out ${outTok}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[messaging-ai] ${err?.message || err}`);
    process.exit(1);
  });
}
