// A deal's file center and Claude's review of it (Luke, Oct 27: "the storage
// center or file center for each deal … a 'claude review' section where it
// can give all the key information we need and propose information to fill
// in when ready"). Owners and the TC; tables in edge/dealFiles.sql, API
// functions/api/deal-files/[id].js, page src/deals/DealFiles.jsx.
//
// Files live in R2 (env.FILES, bucket vpg-deal-files, key deals/<deal>/<id>)
// when the Pages project has the binding (Luke, Oct 27: "switch to R2 now");
// without it — and for any file saved before — in D1 as base64 pieces of
// CHUNK bytes (a multiple of 3, so the pieces' base64 joins into the whole
// file's). Each row says which (`store`). Claude reads each file once
// (readFile — a PDF or a photo as a document / image block) and keeps what it
// read on the file; the deal's review (reviewDeal) is then built from those
// readings and the tracker's values, text only, so a second review costs
// cents. Claude never writes to the deal: its proposals go into the deal
// panel as unsaved edits, and a person saves them.
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, costOf } from './chat.js';
import { FIELD, isBlank, stageOf } from '../src/deals/math.js';
import { ZONE_KEYS } from '../src/deals/ddTime.js';
import { KIND_KEYS, KIND_LABEL, PROPOSE_KEYS, PDF, readable } from '../src/deals/files.js';
import { clean, isOwner, isRepView } from './deals.js';

// What reps and managers may open (Luke, Oct 27: "dont allow reps to upload,
// allow them to view"): not the assignment, settlement statement or wire —
// those name the buyer and VPG's fee (buyer is owners only, Oct 14).
export const REP_HIDDEN_KINDS = ['assignment', 'hud', 'wire'];
export const repMay = (f) => !REP_HIDDEN_KINDS.includes(f.kind);

export const CHUNK = 1_400_001;
export const newFileId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

const COLS = 'id, deal_id, name, mime, size, chunks, store, kind, kind_set, uploaded_by, uploaded_at, read, read_at, read_error';
export async function listFiles(db, dealId) {
  const r = await db.prepare(`SELECT ${COLS} FROM deal_files WHERE deal_id = ? ORDER BY uploaded_at`).bind(dealId).all();
  return r.results.map((f) => ({ ...f, read: parse(f.read) }));
}
export async function getFile(db, dealId, id) {
  const f = await db.prepare(`SELECT ${COLS} FROM deal_files WHERE id = ? AND deal_id = ?`).bind(id, dealId).first();
  return f ? { ...f, read: parse(f.read) } : null;
}

const r2Key = (f) => `deals/${f.deal_id}/${f.id}`;
// The file first, its row last — a failed upload never shows in the list.
export async function saveFile(env, { dealId, name, mime, bytes, kind, kindSet, user, now }) {
  const db = env.DB;
  const id = newFileId();
  const r2 = !!env.FILES;
  const n = r2 ? 0 : Math.max(1, Math.ceil(bytes.length / CHUNK));
  try {
    if (r2) await env.FILES.put(r2Key({ deal_id: dealId, id }), bytes, { httpMetadata: { contentType: mime } });
    for (let i = 0; i < n; i++) {
      await db.prepare('INSERT INTO deal_file_chunks (file_id, n, data) VALUES (?, ?, ?)').bind(id, i, toB64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK))).run();
    }
    await db.batch([
      db.prepare('INSERT INTO deal_files (id, deal_id, name, mime, size, chunks, store, kind, kind_set, uploaded_by, uploaded_email, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, dealId, name, mime, bytes.length, n, r2 ? 'r2' : 'd1', kind, kindSet ? 1 : 0, user.name, user.email, now),
      db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(dealId, now, user.email, user.name, '*file', 'null', JSON.stringify(`${name} (${KIND_LABEL[kind]})`)),
    ]);
  } catch (e) {
    if (r2) await env.FILES.delete(r2Key({ deal_id: dealId, id })).catch(() => {});
    await db.prepare('DELETE FROM deal_file_chunks WHERE file_id = ?').bind(id).run().catch(() => {});
    throw e;
  }
  return id;
}

// The whole file as base64 (for Claude) — from R2, or one D1 piece per query.
export async function fileB64(env, f) {
  if (f.store === 'r2') {
    const o = await env.FILES?.get(r2Key(f));
    if (!o) throw new Error('the file is missing from storage');
    return toB64(new Uint8Array(await o.arrayBuffer()));
  }
  const db = env.DB;
  let out = '';
  for (let i = 0; i < f.chunks; i++) out += (await db.prepare('SELECT data FROM deal_file_chunks WHERE file_id = ? AND n = ?').bind(f.id, i).first())?.data || '';
  return out;
}
// The file for the browser: R2's own stream, or the D1 pieces one at a time.
export async function fileStream(env, f) {
  if (f.store === 'r2') return (await env.FILES?.get(r2Key(f)))?.body || null;
  const db = env.DB;
  let i = 0;
  return new ReadableStream({
    async pull(ctl) {
      if (i >= f.chunks) { ctl.close(); return; }
      const row = await db.prepare('SELECT data FROM deal_file_chunks WHERE file_id = ? AND n = ?').bind(f.id, i).first();
      i += 1;
      if (row) ctl.enqueue(fromB64(row.data));
    },
  });
}

export async function removeFile(env, f, user, now) {
  const db = env.DB;
  if (f.store === 'r2') await env.FILES?.delete(r2Key(f));
  await db.batch([
    db.prepare('DELETE FROM deal_file_chunks WHERE file_id = ?').bind(f.id),
    db.prepare('DELETE FROM deal_files WHERE id = ?').bind(f.id),
    db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(f.deal_id, now, user.email, user.name, '*file', JSON.stringify(f.name), 'null'),
  ]);
}

// --- What the TC may see ------------------------------------------------------------
// Buyer names (and every secret field) are for owners only: anything Claude
// marked secret, and proposals for secret fields, are taken out for the TC.
const keepFor = (user) => (x) => isOwner(user) || (!x.secret && !(x.key && FIELD[x.key]?.secret));
export function fileFor(f, user) {
  const { deal_id, store, ...rest } = f; // eslint-disable-line no-unused-vars
  // Reps / managers: the file itself, not what Claude read (it can hold money and names).
  if (isRepView(user)) return { ...rest, read: null, read_error: null };
  const r = f.read;
  return { ...rest, read: r && { ...r, facts: (r.facts || []).filter(keepFor(user)), fields: (r.fields || []).filter(keepFor(user)) } };
}
export function reviewFor(rv, user) {
  if (!rv) return null;
  const k = keepFor(user);
  return { ...rv, keyInfo: (rv.keyInfo || []).filter(k), issues: (rv.issues || []).filter(k), proposals: (rv.proposals || []).filter(k) };
}

// --- The tracker's fields for Claude --------------------------------------------------
const LIST_KEY = { listing: 'listing', state: 'states', dealType: 'dealTypes', cfar: 'yesNo', emdPaidBy: 'emdPaidBy' };
const choicesOf = (key, lists) => (key === 'ddEndTz' ? ZONE_KEYS : (lists?.[LIST_KEY[key]] || []).filter((x) => String(x).toUpperCase() !== 'PENDING'));
const GUIDE = {
  address: 'the property address (street, city, state, zip)',
  accepted: 'contract acceptance / effective date — when the last party signed the purchase contract',
  coe: 'closing date (close of escrow / COE)',
  price: "VPG's purchase price with the seller (an addendum's new price wins)",
  dealType: 'deal type — WHOLESALE for an assignment; DOUBLE CLOSE when VPG buys and resells; CREATIVE for seller financing / subject-to',
  listing: 'whether the property was listed with an agent (ON-MARKET) or not (OFF-MARKET)',
  state: 'the state the property is in',
  title: 'title / escrow company, with the escrow officer and their email / phone when shown',
  escrow: 'escrow / title file number',
  emd: "VPG's earnest money in the purchase contract",
  buyerEmd: "the end buyer's earnest money in the assignment",
  optionFee: 'option fee (Texas contracts)',
  cfar: 'YES when VPG may cancel for any reason during the inspection / option period, NO when not',
  emdSent: "date VPG's earnest money reached title (EMD receipt)",
  emdPaidBy: 'who put up earnest money — VPG, BUYER (the end buyer), or VPG + BUYER',
  ddDays: 'length of the inspection / due diligence / option period in days',
  ddEndTime: 'time of day the inspection period ends, HH:MM in 24 hours',
  ddEndTz: 'time zone of that time',
  buyer: 'the end buyer / assignee (name, entity)',
  vpgAssign: "VPG assignment price = the total the end buyer pays for the contract: VPG's purchase price + the assignment fee (when only the fee is stated, add it to the purchase price)",
  finalAssign: 'final assignment price — the same total as it ended up on the settlement statement',
  addlFees: "fees taken out of VPG's assignment fee at closing (settlement statement, assignor's side)",
  closingCosts: "VPG's closing costs on a double close",
  wireReceived: 'total wired to VPG at closing',
  wireDate: 'date the wire to VPG arrived',
};
export function fieldGuide(lists) {
  return PROPOSE_KEYS.map((k) => {
    const ch = choicesOf(k, lists);
    const fmt = ch.length ? `one of: ${ch.join(' | ')}` : ({ money: 'number', number: 'whole number', date: 'YYYY-MM-DD', time: 'HH:MM' }[FIELD[k].type] || 'text');
    return `- ${k} (${FIELD[k].label}; ${fmt}): ${GUIDE[k]}`;
  }).join('\n');
}

// Claude's text → a value the tracker takes (clean in edge/deals.js), or null.
export function toValue(key, raw, lists) {
  const f = FIELD[key];
  if (!f || !PROPOSE_KEYS.includes(key)) return null;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let v;
  const ch = choicesOf(key, lists);
  if (ch.length) v = ch.find((c) => String(c).toUpperCase() === s.toUpperCase()) ?? null;
  else if (f.type === 'money' || f.type === 'number') {
    const n = Number(s.replace(/[$,\s]/g, ''));
    v = Number.isFinite(n) && n >= 0 ? (f.type === 'number' ? Math.round(n) : Math.round(n * 100) / 100) : null;
  } else if (f.type === 'date') v = /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) ? s : null;
  else if (f.type === 'time') v = /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
  else v = s.slice(0, 300);
  if (v == null) return null;
  const c = clean(key, v);
  return c.error || c.value == null ? null : c.value;
}
const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
export const sameValue = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : norm(a) === norm(b));

// --- Claude ---------------------------------------------------------------------
const ABOUT = 'Valley Property Group (VPG) is a real-estate wholesaling company. VPG puts a property under contract with the seller (the purchase contract — VPG is the buyer in it), then assigns that contract to an investor (the end buyer, or assignee) for an assignment fee, and the deal closes through a title / escrow company. Some deals are double closes (VPG buys and resells the same day).';

const READ_SYSTEM = (lists) => `${ABOUT}

You read one document from a deal's file center, for VPG's owners and transaction coordinator. Report what it is and what it says.
- kind: purchase (the purchase contract between the seller and VPG), addendum (an addendum, amendment, counter-offer or extension to it), assignment (the assignment of the contract to the end buyer), emd (an earnest money receipt or deposit confirmation), title (title commitment, escrow opening or title / escrow letters), inspection (inspection reports, photos of the property), hud (settlement statement, HUD-1, closing disclosure, ALTA), wire (a wire or payment confirmation), cancel (a cancellation, termination or release), other.
- docTitle: the document's own title, short.
- summary: one or two plain sentences — what it is, who signed, the key terms. Never name the end buyer / assignee in it; say "the buyer".
- signed: signed (every party), partly (a signature or initials missing), unsigned, unclear.
- property: the property address as the document writes it ('' when none).
- facts: up to 12 key facts a transaction coordinator needs from it, each { label, value, secret } — dates (acceptance / effective, closing, inspection or option period end, EMD due), prices and fees, earnest money and who holds it, the title company and file number, contingencies and special terms, the seller's name. secret = true for anything that names or identifies the end buyer / assignee, false otherwise.
- fields: the deal tracker's fields this document states, each { key, value, quote } — only what the document actually says, never a guess. quote = the few words it comes from (no buyer name in a quote unless the key is buyer). Money as a plain number (125000), dates YYYY-MM-DD, times HH:MM in 24 hours, list fields exactly one of the values given. The fields:
${fieldGuide(lists)}
Plain words, short.`;

const READ_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: KIND_KEYS },
    docTitle: { type: 'string' },
    summary: { type: 'string' },
    signed: { type: 'string', enum: ['signed', 'partly', 'unsigned', 'unclear'] },
    property: { type: 'string' },
    facts: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, secret: { type: 'boolean' } }, required: ['label', 'value', 'secret'], additionalProperties: false } },
    fields: { type: 'array', items: { type: 'object', properties: { key: { type: 'string', enum: PROPOSE_KEYS }, value: { type: 'string' }, quote: { type: 'string' } }, required: ['key', 'value', 'quote'], additionalProperties: false } },
  },
  required: ['kind', 'docTitle', 'summary', 'signed', 'property', 'facts', 'fields'],
  additionalProperties: false,
};

const clip = (x, n) => String(x ?? '').slice(0, n);
async function ask(env, { system, content, schema, maxTokens }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') throw new Error("Claude couldn't read this one");
  if (res.stop_reason === 'max_tokens') throw new Error('The reading ran long — try again');
  return { out: JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')), usage: res.usage || {}, cost: costOf(res.usage || {}) };
}

// One file → what Claude read in it.
export async function readFile(env, f, b64, deal, lists) {
  if (!readable(f)) throw new Error('Claude reads PDFs and photos (up to 5 MB) only');
  const block = f.mime === PDF
    ? { type: 'document', source: { type: 'base64', media_type: PDF, data: b64 }, title: clip(f.name, 200) }
    : { type: 'image', source: { type: 'base64', media_type: f.mime, data: b64 } };
  const { out, usage, cost } = await ask(env, {
    system: READ_SYSTEM(lists),
    maxTokens: 4000,
    schema: READ_SCHEMA,
    content: [block, { type: 'text', text: `File name: ${clip(f.name, 200)}\nThe deal's address in the tracker: ${deal.address || '(none yet)'}\nRead this document.` }],
  });
  const read = {
    kind: KIND_KEYS.includes(out.kind) ? out.kind : 'other',
    docTitle: clip(out.docTitle, 120),
    summary: clip(out.summary, 500),
    signed: ['signed', 'partly', 'unsigned', 'unclear'].includes(out.signed) ? out.signed : 'unclear',
    property: clip(out.property, 200),
    facts: (out.facts || []).slice(0, 12).map((x) => ({ label: clip(x.label, 60), value: clip(x.value, 300), secret: !!x.secret })),
    fields: (out.fields || []).map((x) => ({ key: x.key, value: toValue(x.key, x.value, lists), quote: clip(x.quote, 200) })).filter((x) => x.value != null).slice(0, 25),
  };
  return { read, usage, cost };
}

const REVIEW_SYSTEM = (lists) => `${ABOUT}

You review a deal's whole file for VPG's owners and transaction coordinator. You get the deal as the tracker has it now, its stage, today's date, and what was read from each file (with its id and when it was added). Write:
- headline: one line on where the file stands (e.g. "Contract, addendum and EMD receipt on file — no assignment yet").
- keyInfo: up to 14 items { label, value, file, secret } — what the team needs at a glance, from the documents (the latest addendum wins): purchase price, acceptance date, closing date, inspection period and when it ends, EMD amount / due date / who holds it, title company and file number, assignment price / fee, the buyer's EMD, special terms or contingencies, the seller. file = the id of the file it comes from ('' when it's from several). secret = true when it names or identifies the end buyer / assignee.
- issues: up to 8 { level, text, secret } — red: needs action or contradicts (the tracker says X but the latest document says Y; an unsigned contract; a document for a different address; a deadline already passed); amber: worth checking.
- missing: documents expected by this stage that aren't in the files — Under Contract: purchase contract, then the EMD receipt; Dispo Active: the same; Assigned: also the assignment contract and the buyer's EMD receipt; Closed: also the settlement statement and the wire confirmation. Short names; empty when nothing is missing.
- proposals: tracker fields to fill in or correct, { key, value, file, why } — only when a document states the value AND the tracker is blank or different. The latest addendum wins over the contract. why = 14 words or fewer. Formats and fields:
${fieldGuide(lists)}
Plain words, short. Never name the end buyer / assignee outside a buyer proposal or an item marked secret.`;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    keyInfo: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, file: { type: 'string' }, secret: { type: 'boolean' } }, required: ['label', 'value', 'file', 'secret'], additionalProperties: false } },
    issues: { type: 'array', items: { type: 'object', properties: { level: { type: 'string', enum: ['red', 'amber'] }, text: { type: 'string' }, secret: { type: 'boolean' } }, required: ['level', 'text', 'secret'], additionalProperties: false } },
    missing: { type: 'array', items: { type: 'string' } },
    proposals: { type: 'array', items: { type: 'object', properties: { key: { type: 'string', enum: PROPOSE_KEYS }, value: { type: 'string' }, file: { type: 'string' }, why: { type: 'string' } }, required: ['key', 'value', 'file', 'why'], additionalProperties: false } },
  },
  required: ['headline', 'keyInfo', 'issues', 'missing', 'proposals'],
  additionalProperties: false,
};

const STAGE_WORD = { UNDER_CONTRACT: 'Under Contract', DISPO_ACTIVE: 'Dispo Active', ASSIGNED: 'Assigned', COMPLETE: 'Closed', CANCELLED: 'Cancelled' };
const show = (v) => (isBlank(v) ? '(blank)' : typeof v === 'number' ? String(v) : String(v));

// The whole file → the deal's review. `deal` is the owner's view (the review
// is shared; reviewFor strips what the TC may not see).
export async function reviewDeal(env, deal, files, lists, today) {
  const read = files.filter((f) => f.read);
  const tracker = PROPOSE_KEYS.map((k) => `${k}: ${show(deal[k])}`).join('\n');
  const docs = read.map((f) => [
    `FILE ${f.id} — "${f.name}" (${KIND_LABEL[f.kind]}, added ${f.uploaded_at.slice(0, 10)})`,
    `${f.read.docTitle} · ${f.read.signed} · property: ${f.read.property || '—'}`,
    f.read.summary,
    ...f.read.facts.map((x) => `- ${x.label}: ${x.value}${x.secret ? ' [buyer]' : ''}`),
    ...f.read.fields.map((x) => `- field ${x.key} = ${x.value} ("${x.quote}")`),
  ].join('\n')).join('\n\n');
  const unread = files.filter((f) => !f.read).map((f) => `- "${f.name}" (${KIND_LABEL[f.kind]}) — ${f.read_error || 'not read (not a PDF or photo)'}`).join('\n');
  const text = `Today: ${today}\nStage: ${STAGE_WORD[stageOf(deal)] || stageOf(deal)}\n\nTHE TRACKER NOW\n${tracker}\n\nTHE FILES\n${docs || '(none read)'}${unread ? `\n\nFILES NOT READ\n${unread}` : ''}\n\nReview this deal's file.`;
  const { out, usage, cost } = await ask(env, { system: REVIEW_SYSTEM(lists), content: text, schema: REVIEW_SCHEMA, maxTokens: 6000 });
  const ids = new Set(files.map((f) => f.id));
  const fileOf = (x) => (ids.has(x) ? x : '');
  const seen = new Set();
  const proposals = [];
  for (const p of out.proposals || []) {
    const value = toValue(p.key, p.value, lists);
    if (value == null || seen.has(p.key) || sameValue(value, deal[p.key])) continue;
    seen.add(p.key);
    proposals.push({ key: p.key, value, from: deal[p.key] ?? null, file: fileOf(p.file), why: clip(p.why, 140), secret: !!FIELD[p.key].secret });
  }
  const review = {
    headline: clip(out.headline, 200),
    keyInfo: (out.keyInfo || []).slice(0, 14).map((x) => ({ label: clip(x.label, 60), value: clip(x.value, 300), file: fileOf(x.file), secret: !!x.secret })),
    issues: (out.issues || []).slice(0, 8).map((x) => ({ level: x.level === 'red' ? 'red' : 'amber', text: clip(x.text, 300), secret: !!x.secret })),
    missing: (out.missing || []).slice(0, 8).map((x) => clip(x, 80)),
    proposals,
  };
  return { review, usage, cost };
}

// --- Ask about the files (Luke, Oct 27: "a section where i can ask a specific
// question about the documents") -------------------------------------------------
// Each question goes to Claude with the deal's documents themselves (PDFs and
// photos, up to ASK_MAX_B64 of base64 — the request limit is 32 MB), the
// tracker's values and the person's earlier questions on this deal. The
// documents sit in a cached block, so follow-ups within 5 minutes cost a
// fraction. One thread per person per deal (chat_messages thread
// dealask:<dealId>:<email>), so an owner's answers naming the buyer never
// reach the TC.
export const ASK_MAX_B64 = 24_000_000;
export const ASK_DAILY = 40;
export const askThread = (dealId, user) => `dealask:${dealId}:${user.email}`;

const ASK_SYSTEM = (owner) => `${ABOUT}

You answer questions about one deal's documents for VPG's ${owner ? 'owners' : 'transaction coordinator'}. You have the documents themselves, the deal as the tracker has it now, and the earlier questions on this deal.
- Answer only from the documents and the tracker values given. Say which document (its file name) and, when you can, the page or section. If the documents don't say, say so plainly — never guess or use outside knowledge of the law or the market.
- When documents disagree (an addendum changes the contract), say which one wins and why.
- Short and plain: lead with the answer, then the detail. Dates as "Nov 21, 2026", money as "$140,000".${owner ? '' : '\n- Never name or identify the end buyer / assignee — say "the buyer".'}
- files: the ids of the files your answer comes from.`;

const ASK_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
  required: ['answer', 'files'],
  additionalProperties: false,
};

// docs = [{ f, b64 }] (readable files, already loaded); history = [{ q, a }].
export async function askFiles(env, { deal, docs, skipped, history, question, owner }) {
  const blocks = docs.map(({ f, b64 }) => (f.mime === PDF
    ? { type: 'document', source: { type: 'base64', media_type: PDF, data: b64 }, title: `${clip(f.name, 150)} [${f.id}]` }
    : { type: 'image', source: { type: 'base64', media_type: f.mime, data: b64 } }));
  if (blocks.length) blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  const names = docs.map(({ f }) => `- ${f.id}: "${f.name}" (${KIND_LABEL[f.kind]})`).join('\n');
  const tracker = PROPOSE_KEYS.filter((k) => owner || !FIELD[k].secret).map((k) => `${FIELD[k].label}: ${show(deal[k])}`).join('\n');
  const earlier = history.slice(-8).map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n\n');
  const text = [
    `THE FILES ABOVE\n${names || '(none readable)'}`,
    skipped.length ? `NOT INCLUDED (too large or not a PDF / photo): ${skipped.map((f) => `"${f.name}"`).join(', ')}` : '',
    `THE TRACKER NOW (stage: ${STAGE_WORD[stageOf(deal)] || stageOf(deal)})\n${tracker}`,
    earlier ? `EARLIER QUESTIONS ON THIS DEAL\n${earlier}` : '',
    `QUESTION\n${clip(question, 1000)}`,
  ].filter(Boolean).join('\n\n');
  const { out, usage, cost } = await ask(env, { system: ASK_SYSTEM(owner), content: [...blocks, { type: 'text', text }], schema: ASK_SCHEMA, maxTokens: 3000 });
  const ids = new Set(docs.map(({ f }) => f.id));
  return { answer: clip(out.answer, 4000), files: (out.files || []).filter((x) => ids.has(x)).slice(0, 6), usage, cost };
}
