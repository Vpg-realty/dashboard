// One deal, opened from any Deals page in a panel on the right (the page
// link carries ?deal=<id>, so it can be shared). Every column of the old
// sheet, grouped like its header; formulas recalculate as you type; nothing
// is saved until "Save". History shows who changed what. The TC never sees
// the commission / profit group (the server doesn't send it either).
import StageChip from '../shell/StageChip.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { setLeaveGuard, linkProps } from '../shell/router.js';
import { FIELDS, GROUPS, compute, payouts, repSees, zillowUrl, BOOKS_KEYS, booksOpen, retradePending, isBlank, isOpen, ghlMismatches, keptMoney } from './math.js';
import { useDeals, saveDeal, createDeal, deleteDeal, dealHistory, ghlDeals, addrKeys, pushToGhl } from './store.js';
import { StatusChip, GhlChip, Notice, StepPill } from './ui.jsx';
import { nextStep, TONES, daysBetween } from './status.js';
import { money, shortDate, btnCls, primaryCls, NEEDS_BUYER, noBuyer } from './format.js';
import { laToday } from '../utils/historyRange.js';
import { PICK_FROM_PAST, pastValues, ISO, LABEL, show } from './fieldLib.js';
import { Input } from './fields.jsx';
import { needsInfo } from './required.js';
import { editFields } from './edits.js';
import { PANEL_HEAD, PANEL_NUM } from '../shell/panelStyle.js';
import { netLossHigh, ALERT } from './sheet.js';
import { showEndTime, ipEndAlert } from './ddTime.js';
import { useDealPay } from '../finance/store.js';
import { partOfField, payText } from '../finance/lines.js';
import { PILL_TONE, pretty } from './values.js';
import CancelDialog from './CancelDialog.jsx';
import { stageOf } from './math.js';
import MismatchList from './Mismatch.jsx';
import { mismatchRow } from './mismatchRow.js';

// Finance's state on a commission (owners): Paid Oct 13 · Zelle / Approved /
// To approve — Finance › Money In & Out is where it changes.
function PayTag({ line }) {
  const t = payText(line);
  if (!t) return null;
  return <a {...linkProps('/finance/money')} title="Commission payouts are approved and paid in Finance › Money In & Out" className={`inline-flex items-center rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold ring-1 ring-inset whitespace-nowrap ${PILL_TONE[t.tone]}`}>{t.text}</a>;
}

const TZ_FIELD = FIELDS.find((f) => f.key === 'ddEndTz');

// One look for every highlighted field box (Luke, Oct 14: "needed" and
// "check this" boxes looked different and ran together): same padding,
// radius and ring on every field — needed red, check amber, retrade amber
// and stronger — with the grid's gap between boxes. Oct 16 (Luke: "the
// yellow boxes are too large … needs to be cleaner"): needed / check this
// are a thin coloured edge on the left and a small label, not a filled box,
// and read-only viewers don't get "check this" (nothing for them to do).
// Due diligence as a timeline (Luke, Oct 16: start and end on one line, the
// time with the end): Starts —— N days —— Ends, the end time under the end.
const dayParts = (iso) => {
  if (!ISO.test(iso || '')) return null;
  const dt = new Date(`${iso}T12:00:00`);
  return { date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), sub: `${dt.toLocaleDateString('en-US', { weekday: 'long' })}, ${dt.getFullYear()}` };
};
const DdEnd = ({ p, label, right, extra }) => (
  <div className={`min-w-0 ${right ? 'text-right' : ''}`}>
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-tan-600">{label}</div>
    <div className="text-[18px] font-semibold text-navy-800 tabular-nums leading-tight">{p ? p.date : <span className="text-zinc-300">—</span>}</div>
    <div className="text-[12px] text-zinc-500">{p ? p.sub : 'set the contract date and days'}</div>
    {extra}
  </div>
);
function DdTimeline({ d }) {
  const a = dayParts(d.ddStart), b = dayParts(d.ddEnd);
  const n = Number(d.ddDays);
  const end = showEndTime(d);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-1 py-1">
      <DdEnd p={a} label="Starts" />
      <div className="relative h-6 flex items-center justify-center">
        <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-tan-400" />
        <span className="absolute left-0 top-1/2 w-2 h-2 -translate-y-1/2 rounded-full bg-tan-500" />
        <span className="absolute right-0 top-1/2 w-2 h-2 -translate-y-1/2 rounded-full bg-navy-700" />
        <span className="relative rounded-full bg-white ring-1 ring-tan-400 px-2.5 py-0.5 text-[12px] font-semibold text-navy-700 whitespace-nowrap">{Number.isFinite(n) && n > 0 ? `${n} day${n === 1 ? '' : 's'}` : 'days not set'}</span>
      </div>
      <DdEnd p={b} label="Ends" right extra={<div className={`mt-0.5 text-[12.5px] font-semibold ${end ? 'text-navy-700' : 'text-zinc-400 font-normal'}`}>{end ? `at ${end}` : 'no end time set'}</div>} />
    </div>
  );
}

// The deal's status tiles (Luke, Oct 23 — option A2 of the mock-ups: "make
// it clear these are status tiles"): a "Deal Status" band with the worst
// tile's word, then six tiles — contracted, assigned at, gross; EMD,
// inspection (start ── days ── end), COE — each with a line icon whose square
// takes its status colour, and a status word under the value.
const TILE_TONE = {
  ok: { ico: 'bg-[#ecfdf3] text-[#15803d]', pill: 'bg-[#ecfdf3] text-[#15803d]' },
  warn: { ico: 'bg-[#fef6e7] text-[#b54708]', pill: 'bg-[#fef6e7] text-[#b54708]' },
  bad: { ico: 'bg-[#fdf1f0] text-[#b42318]', pill: 'bg-[#fdf1f0] text-[#b42318]' },
  done: { ico: 'bg-[#eef2f6] text-[#475569]', pill: 'bg-[#eef2f6] text-[#475569]' },
  plain: { ico: 'bg-tan-100 text-navy-700', pill: '' },
};
const RANK = { bad: 3, warn: 2, ok: 1, done: 0, plain: 0 };
const ICON = {
  pen: <><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  arrow: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  trend: <><path d="M4 17l6-6 4 4 6-7" /><path d="M15 8h5v5" /></>,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
};
function StatusTile({ icon, label, tone = 'plain', word, children }) {
  const t = TILE_TONE[tone] || TILE_TONE.plain;
  return (
    <div className="min-w-0 rounded-xl border border-tan-200 bg-white px-3 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={`grid place-items-center w-6 h-6 rounded-md shrink-0 ${t.ico}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICON[icon]}</svg>
        </span>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tan-600 whitespace-nowrap">{label}</span>
      </div>
      <div className="text-[16.5px] font-bold tabular-nums text-navy-900 truncate">{children}</div>
      {word && <span className={`self-start inline-flex items-center gap-1.5 rounded-full px-2 py-[1px] text-[11.5px] font-bold whitespace-nowrap ${t.pill}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{word}</span>}
    </div>
  );
}
function IpSpan({ d }) {
  const n = Number(d.ddDays);
  return (
    <span className="grid grid-cols-[auto_minmax(14px,1fr)_auto] items-end gap-x-1.5 text-[14.5px]">
      <span><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tan-600">Start</span>{d.accepted ? shortDate(d.accepted) : '—'}</span>
      <span className="relative h-5 flex items-center justify-center" title={showEndTime(d) ? `ends ${showEndTime(d)}` : undefined}>
        <span className="absolute inset-x-0 top-1/2 h-px bg-tan-400" />
        <span className="relative bg-white px-1 text-[10.5px] font-bold text-tan-700 whitespace-nowrap">{Number.isFinite(n) && n > 0 ? `${n} days` : '—'}</span>
      </span>
      <span className="text-right"><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tan-600">End</span>{d.ddEnd ? shortDate(d.ddEnd) : '—'}</span>
    </span>
  );
}
// Each tile's word and colour.
function tileStatus(d) {
  const today = laToday();
  const st = String(d.status || '').toUpperCase();
  const finished = st === 'COMPLETE' || st === 'CANCELLED';
  const asg = st === 'ASSIGNED' || (typeof d.vpgAssign === 'number' && d.vpgAssign > 0);
  const days = (iso) => (ISO.test(iso || '') ? daysBetween(today, iso) : null);
  const by = String(d.emdPaidBy || '').toUpperCase();
  const emd = by === 'BUYER' ? ['ok', 'In · Buyer'] : by === 'VPG + BUYER' ? ['ok', 'In · VPG + Buyer'] : by === 'VPG' ? [asg ? 'bad' : 'warn', 'In · VPG only'] : finished ? ['done', 'Not placed'] : ['bad', 'Pending'];
  const ipN = days(d.ddEnd);
  const ip = finished ? ['done', st === 'COMPLETE' ? 'Closed' : 'Cancelled']
    : ipN == null ? ['warn', 'End not set']
      : asg ? (ipN < 0 ? ['done', 'Ended · buyer in'] : ['ok', 'Buyer in'])
        : ipN < 0 ? ['bad', 'Ended · no buyer'] : ipN <= 1 ? ['bad', ipN === 0 ? 'Ends today · no buyer' : 'Ends tomorrow · no buyer'] : ipN <= 3 ? ['warn', `Ends in ${ipN} days`] : ['ok', `${ipN} days left`];
  const coeN = days(d.coe);
  const coe = st === 'COMPLETE' ? ['done', 'Closed'] : st === 'CANCELLED' ? ['done', 'Cancelled']
    : coeN == null ? ['warn', 'Not set'] : coeN < 0 ? ['bad', `${-coeN} day${coeN === -1 ? '' : 's'} late`]
      : coeN === 0 ? ['bad', 'Closing today'] : coeN === 1 ? ['bad', 'Tomorrow'] : coeN <= 3 ? ['warn', `in ${coeN} days`] : ['ok', `in ${coeN} days`];
  const worst = [emd, ip, coe].reduce((w, x) => (RANK[x[0]] > RANK[w[0]] ? x : w), ['ok', '']);
  const band = finished ? ['done', st === 'COMPLETE' ? 'Closed' : 'Cancelled']
    : worst[0] === 'bad' ? ['bad', 'Needs attention'] : worst[0] === 'warn' ? ['warn', 'Coming up'] : ['ok', coeN != null && coeN >= 0 ? `All good · closing in ${coeN} day${coeN === 1 ? '' : 's'}` : 'All good'];
  return { emd, ip, coe, band };
}

// The panel's sections in the order a deal moves (Luke, Oct 25 — option S2 of
// the mock-ups): each holds one or two of the sheet's field groups. The
// section for the deal's stage opens by itself and says "You are here"; the
// others fold to one line with what's in them and ✓ / "N missing". Any
// section opens with a click and stays open; which ones are open is kept per
// deal on this device (localStorage `vpg.deal.open.<id>`).
const SECTIONS = [
  { id: 'contract', label: 'The Contract', short: 'Contract', groups: ['contract', 'title'] },
  { id: 'emd', label: 'Earnest Money & Inspection', short: 'EMD & Inspection', groups: ['emd', 'dd'] },
  { id: 'dispo', label: 'Selling It', short: 'Selling It', groups: ['dispo'] },
  { id: 'money', label: 'The Money', short: 'Money', groups: ['money', 'pay'] },
  { id: 'notes', label: 'Notes & Links', short: 'Notes', groups: ['notes'] },
];
const SUB_LABEL = { contract: 'Contract', title: 'Title', emd: 'Earnest Money', dd: 'Inspection Period', dispo: 'Dispositions', money: 'Financials', pay: 'Commissions & Profit', notes: 'Notes & Links' };
const HERE = { UNDER_CONTRACT: 'emd', DISPO_ACTIVE: 'dispo', ASSIGNED: 'dispo', COMPLETE: 'money', CANCELLED: 'emd' };
const secOfGroup = (gid) => SECTIONS.find((x) => x.groups.includes(gid))?.id;
const openKey = (id) => `vpg.deal.open.${id}`;
function readOpen(id) {
  try { const v = JSON.parse(localStorage.getItem(openKey(id)) || 'null'); return Array.isArray(v) ? v : null; } catch { return null; }
}
function writeOpen(id, list) {
  try { localStorage.setItem(openKey(id), JSON.stringify(list)); } catch { /* private window */ }
}
const first = (v) => String(v || '').trim().split(' ')[0];
const clip = (v, n) => { const t = String(v || '').split('\n')[0].trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// One line that says what's in a folded section.
function summaryOf(sec, d, { owner, ro }) {
  const has = (v) => !isBlank(v);
  const parts = {
    contract: [first(d.acq), has(d.dealType) && pretty('dealType', d.dealType), ISO.test(d.accepted || '') && `${shortDate(d.accepted)} → COE ${ISO.test(d.coe || '') ? shortDate(d.coe) : '—'}`, typeof d.price === 'number' && d.price > 0 && money(d.price), has(d.title) && clip(d.title, 28)],
    emd: [typeof d.emd === 'number' && d.emd > 0 ? `${money(d.emd)} EMD` : 'No EMD amount', has(d.emdPaidBy) && String(d.emdPaidBy).toUpperCase() !== 'PENDING' ? pretty('emdPaidBy', d.emdPaidBy) : 'not placed yet', ISO.test(d.ddEnd || '') && `IP ends ${shortDate(d.ddEnd)}`],
    dispo: [first(d.dispoMember), owner && has(d.buyer) && clip(d.buyer, 26), typeof d.vpgAssign === 'number' && d.vpgAssign > 0 ? `Assigned at ${money(d.vpgAssign)}` : 'No buyer yet'],
    money: noBuyer(d) && !keptMoney(d) ? ['No buyer yet'] : [typeof d.grossAssign === 'number' && `Gross ${money(d.grossAssign)}`, !ro && typeof d.netAssign === 'number' && `Net ${money(d.netAssign)}`, owner && typeof d.netProfit === 'number' && `Profit ${money(d.netProfit)}`],
    notes: [ro ? null : has(d.notes) ? clip(d.notes, 50) : 'No notes', has(d.links) && 'Zillow link'],
  }[sec] || [];
  return parts.filter(Boolean).join(' · ');
}

const BOX = 'rounded-lg p-2 ring-1 ring-inset';
const BOX_TONE = {
  plain: 'ring-transparent',
  need: 'ring-transparent rounded-l-none shadow-[inset_3px_0_0_#D92D20] bg-[#FEF7F6]',
  check: 'ring-transparent rounded-l-none shadow-[inset_3px_0_0_#F79009]',
  retrade: 'bg-amber-50 ring-2 ring-amber-400 transition-colors duration-700',
  flash: 'bg-amber-200 ring-2 ring-amber-500 transition-colors duration-700',
  alert: 'ring-[#F5C2BD]',
};
// Scroll to a field and put the cursor in it (Needs info → "enter it").
function jumpTo(key) {
  const el = document.getElementById(`deal-f-${key}`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const input = el.querySelector('input, select, textarea');
  if (input) setTimeout(() => input.focus({ preventScroll: true }), 250);
}

// Plain-language warnings for what looks wrong (never blocks a save).
function checks(d) {
  const out = [];
  const t = laToday();
  if (ISO.test(d.coe || '') && ISO.test(d.accepted || '') && d.coe < d.accepted) out.push('COE is before the contract date.');
  if (d.status === 'COMPLETE' && !d.wireDate) out.push('Marked closed, but no wire date received yet.');
  if (d.status === 'COMPLETE' && !ISO.test(d.coe || '')) out.push('Marked closed without a COE date.');
  if (isOpen(d) && ISO.test(d.coe || '') && d.coe < t) out.push(`COE (${shortDate(d.coe)}) has passed — update the status or the date.`);
  if (isOpen(d) && d.emdStatus === 'PENDING' && ISO.test(d.emdDue || '') && d.emdDue < t) out.push(`EMD was due ${shortDate(d.emdDue)} and is still pending.`);
  if (typeof d.finalAssign === 'number' && typeof d.price === 'number' && d.finalAssign > 0 && d.finalAssign < d.price) out.push('Final assignment price is below the contracted price.');
  return out;
}

// The Zillow link field: its URLs as links; with none yet, Zillow's search
// for the address (and, for editors, a button to save it as the link).
const URL_RE = /https?:\/\/\S+/g;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } };
function LinkList({ value, address, onUse, small }) {
  const urls = String(value || '').match(URL_RE) || [];
  const z = zillowUrl(address);
  const a = 'text-blue-700 hover:underline underline-offset-2 break-all';
  if (urls.length) {
    if (small) return <span className="flex flex-wrap gap-x-3 mt-1 text-[12.5px]">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className={a}>{/zillow\.com/.test(u) ? 'Open on Zillow ↗' : `Open ${host(u)} ↗`}</a>)}</span>;
    return <div className="flex flex-col gap-0.5 text-[14px] font-medium">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className={a}>{/zillow\.com/.test(u) ? 'Open on Zillow ↗' : u}</a>)}</div>;
  }
  if (!z) return small ? null : <span className="text-zinc-300">—</span>;
  return (
    <span className={`flex flex-wrap items-center gap-x-3 ${small ? 'mt-1 text-[12.5px]' : 'text-[14px] font-medium'}`}>
      <a href={z} target="_blank" rel="noreferrer" className={a}>Search Zillow for this address ↗</a>
      {onUse && <button type="button" onClick={(e) => { e.preventDefault(); onUse(z); }} className="text-zinc-600 hover:text-navy-800 underline underline-offset-2">use as the link</button>}
    </span>
  );
}

// The site writes its changes to the address, title / escrow, COE and IP end
// back to GHL (Luke, Oct 18; scripts/push-ghl.mjs, every refresh): what's on
// its way, what went, and what GHL refused (with why).
const PUSH_LABEL = { address: 'Address', title: 'Title / escrow', coe: 'COE', ipEnd: 'IP end', price: 'Contracted price', status: 'GHL stage' };
function PushNote({ pushes, boxed }) {
  if (!pushes?.length) return null;
  const latest = new Map();
  for (const p of pushes) if (!latest.has(p.field)) latest.set(p.field, p);
  const rows = [...latest.values()];
  if (!rows.length) return null;
  const STAGE_OF = { UNDER_CONTRACT: 'Under Contract', DISPO_ACTIVE: 'Dispo Active', ASSIGNED: 'Assigned', COMPLETE: 'Closed', LOST: 'Lost', ABANDONED: 'Abandoned' };
  const val = (p) => (p.field === 'coe' || p.field === 'ipEnd' ? shortDate(p.value)
    : p.field === 'status' ? STAGE_OF[p.value] || p.value
      : p.field === 'price' ? `$${Number(p.value).toLocaleString('en-US')}` : String(p.value).split('\n')[0]);
  const body = (
    <ul className="mt-1.5 grid gap-0.5 text-[12.5px]">
      {rows.map((p) => (
        <li key={p.field} className="flex flex-wrap gap-x-1.5">
          <b>{PUSH_LABEL[p.field] || p.field} → {val(p)}</b>
          {p.status === 'done' ? <span className="text-emerald-700">✓ updated in GHL</span>
            : p.error ? <span className="text-[#B42318]">not in GHL yet — {p.error}</span>
              : <span className="text-zinc-600">goes to GHL at the next refresh (within ~15 min)</span>}
          <span className="text-zinc-500">· {p.by_name}</span>
        </li>
      ))}
    </ul>
  );
  return boxed ? <div className="rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-violet-900"><div className="font-medium">Changes sent to GoHighLevel</div>{body}</div> : body;
}

function History({ id }) {
  const [log, setLog] = useState(null);
  useEffect(() => { let on = true; dealHistory(id).then((r) => on && setLog(r.log)).catch((e) => on && setLog({ error: e.message })); return () => { on = false; }; }, [id]);
  if (!log) return <div className="py-10 text-center text-zinc-400">Loading history…</div>;
  if (log.error) return <div className="py-10 text-center text-zinc-500">{log.error}</div>;
  if (!log.length) return <div className="py-10 text-center text-zinc-500">No changes since it was imported from the sheet.</div>;
  const val = (field, v) => {
    if (v === 'formula') return 'formula';
    const f = FIELDS.find((x) => x.key === field.replace(/^fixed\./, ''));
    return f ? show(f, v) : String(v ?? '—');
  };
  return (
    <ol className="divide-y divide-zinc-100">
      {log.map((e, i) => (
        <li key={i} className="py-2.5 flex gap-3">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />
          <div className="min-w-0">
            <div>
              <span className="font-medium">{e.by}</span>{' '}
              {e.field === '*created' ? <>added the deal</> : e.field === '*deleted' ? <>deleted the deal</> : e.field === '*linked' ? <>linked the GoHighLevel opportunity</> : e.field === '*pushed' ? <>sent the site's {e.to} to GoHighLevel</> : (
                <>changed <span className="font-medium">{LABEL[e.field.replace(/^fixed\./, '')] || e.field}</span>{e.field.startsWith('fixed.') && ' (typed number)'}: <span className="text-zinc-500 line-through decoration-zinc-300">{val(e.field, e.from)}</span> → {val(e.field, e.to)}</>
              )}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">{new Date(e.at).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DealPanel({ id, initial, onClose, onCreated, focus }) {
  const s = useDeals();
  const isNew = !id;
  const found = s.raw.find((d) => d.id === id);
  const raw = useMemo(() => (isNew ? { ...(initial || {}) } : found), [isNew, initial, found]);
  const [draft, setDraft] = useState({ fields: {}, fixed: {} });
  const [tab, setTab] = useState('details');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [fixErr, setFixErr] = useState(null); // { key, msg } — shown under that mismatch row
  const [base, setBase] = useState(raw?.updatedAt);
  const [flash, setFlash] = useState(false);
  // Leaving with unsaved edits (Luke, Oct 15: "warning me when I click out …
  // that I have not saved changes"): what to do once the person picks Save /
  // Discard in the prompt; null = no prompt.
  const [leaving, setLeaving] = useState(null);
  // Section jump bar under the key facts (Luke, Oct 16: "hard to scroll and
  // find what we are looking for"): which section is at the top right now.
  const bodyRef = useRef(null);
  const [onSec, setOnSec] = useState(null);
  const owner = s.owner;
  const ro = s.readOnly; // reps / managers: their own deals, view only
  // …except the few fields a manager may fix (Luke, Oct 18: COE, IP end via
  // its DD days, EMD amount) — `editable` from the API.
  const editable = new Set(s.editable || []);
  const fro = (k) => ro && !editable.has(k);
  // Changes on their way to GHL (functions/api/deals/[id] → scripts/push-ghl).
  const [pushes, setPushes] = useState(null);
  useEffect(() => { if (isNew || !id) return undefined; let on = true; dealHistory(id).then((r) => on && setPushes(r.pushes || [])).catch(() => {}); return () => { on = false; }; }, [id, isNew, base]);
  const fin = useDealPay(!!owner && !isNew).get(id) || null;
  // "Doesn't match the tracker" fixes (Luke, Oct 23): which row is busy.
  const [fixing, setFixing] = useState(null);
  // The cancel pop-up (Luke, Oct 25): open while the stage is being set to Cancelled.
  const [cancelAsk, setCancelAsk] = useState(false);
  // Sections opened by hand on this deal (null = the defaults: the stage's section and any with something missing).
  const [userOpen, setUserOpen] = useState(() => (id ? readOpen(id) : null));

  const merged = useMemo(() => {
    if (!raw) return null;
    const fixed = { ...(raw.fixed || {}) };
    for (const [k, v] of Object.entries(draft.fixed)) { if (v === 'formula') delete fixed[k]; else fixed[k] = v; }
    return compute({ ...raw, ...draft.fields, fixed }, s.rules, s.lists);
  }, [raw, draft, s.rules, s.lists]);
  const nChanges = Object.keys(draft.fields).length + Object.keys(draft.fixed).length + (isNew ? Object.keys(initial || {}).length : 0);
  const dirty = Object.keys(draft.fields).length + Object.keys(draft.fixed).length > 0 || isNew;
  const hasEdits = Object.keys(draft.fields).length + Object.keys(draft.fixed).length > 0;

  // Every way out asks first while there are edits: the backdrop, ×, Esc (close
  // below), an in-app page change or the browser's Back (router guard), and a
  // reload / tab close (the browser's own "Leave site?" box).
  useEffect(() => {
    if (!hasEdits) return undefined;
    const release = setLeaveGuard((proceed) => { setLeaving(() => proceed); return true; });
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => { release(); window.removeEventListener('beforeunload', onUnload); };
  }, [hasEdits]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (leaving) setLeaving(null); else close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Sections opened for a moment (a jump-bar click, a Needs info chip, ?focus=) — not remembered.
  const [forced, setForced] = useState([]);
  const goField = (key) => {
    const sec = secOfGroup(FIELDS.find((f) => f.key === key)?.group);
    if (sec) setForced((x) => (x.includes(sec) ? x : [...x, sec]));
    setTimeout(() => jumpTo(key), 60);
  };
  // Opened from a Needs info alert (?focus=<field> or focus=need): jump to
  // that field (or the first missing one) once.
  const jumped = useRef(null);
  useEffect(() => {
    if (!focus || !merged || jumped.current === focus) return;
    jumped.current = focus;
    const key = focus === 'need' ? needsInfo(merged, { owner, readOnly: ro })[0]?.fields[0] : focus;
    if (key) setTimeout(() => goField(key), 150);
  });

  if (!raw) return null;
  const g = (() => { const all = ghlDeals(); return addrKeys(merged.address).map((k) => all.get(k)).find(Boolean); })();
  const miss = ghlMismatches(merged, g);
  const warn = checks(merged);
  const step = nextStep(merged);
  const flagged = new Set(step.fields || []);
  const ip = isNew ? null : ipEndAlert(merged);
  // What this deal still needs for its stage (required.js) — only fields
  // this person can fill in.
  const needs = needsInfo(merged, { owner, readOnly: ro });
  const need = new Set(needs.flatMap((x) => x.fields));
  // One edit can carry another field with it (retrade → the price; edits.js).
  const setField = (k, v) => {
    // Cancelling asks the cancel questions first (CancelDialog).
    if (k === 'status' && String(v).toUpperCase() === 'CANCELLED' && !isNew && stageOf(merged) !== 'CANCELLED') { setCancelAsk(true); return; }
    const now = { ...raw, ...draft.fields };
    const patch = editFields(now, k, v);
    if (k === 'retrade' && 'price' in patch) { setFlash(true); setTimeout(() => setFlash(false), 900); }
    // An older typed IP end gives way when the contract date or IP days
    // change — a new start keeps the same number of IP days (Luke, Oct 25;
    // the server does the same, edge/deals.js applyEdit).
    const typedEnd = raw.fixed?.ddEnd;
    const ddFix = (k === 'accepted' || k === 'ddDays') && typedEnd != null && draft.fixed.ddEnd === undefined;
    if (ddFix && k === 'accepted' && !('ddDays' in draft.fields) && ISO.test(typedEnd) && ISO.test(raw.accepted || '')) {
      const span = daysBetween(raw.accepted, typedEnd);
      if (span >= 0) patch.ddDays = span;
    }
    setDraft((d) => ({ ...d, fields: { ...d.fields, ...patch }, fixed: ddFix && !ro ? { ...d.fixed, ddEnd: 'formula' } : d.fixed }));
  };
  const setFixed = (k, v) => setDraft((d) => ({ ...d, fixed: { ...d.fixed, [k]: v } }));
  function close() {
    if (hasEdits) { setLeaving(() => onClose); return; }
    onClose();
  }

  // Fix a mismatch on the spot (Luke, Oct 23: "push edit to GHL or push edit
  // to the site — sometimes we are wrong on the site so GHL could have the
  // most up to date info"). To GHL: the site's value is queued as it stands
  // (functions/api/deals/[id] `push`, sent at the next refresh). To the
  // site: GHL's value is saved here at once (the IP end through the IP days
  // from the contract date).
  const FIX_FIELD = { coe: 'coe', ipEnd: 'ddDays', status: 'status' };
  const mayFix = (m) => !ro || (m.key !== 'status' && editable.has(FIX_FIELD[m.key]));
  async function fixToGhl(m) {
    setFixing(m.key); setErr(null); setFixErr(null);
    try { await pushToGhl(id, [m.key]); const h = await dealHistory(id); setPushes(h.pushes || []); } catch (e) { setFixErr({ key: m.key, msg: e.message }); } finally { setFixing(null); }
  }
  async function fixToSite(m) {
    let fields;
    if (m.key === 'coe') fields = { coe: m.ghl };
    else if (m.key === 'status') fields = { status: m.ghl };
    else {
      if (!ISO.test(merged.accepted || '')) { setFixErr({ key: m.key, msg: 'Add the contract date first — the IP end is counted from it.' }); return; }
      // Never an IP end before the start (Luke, Oct 25).
      if (m.ghl < merged.accepted) { setFixErr({ key: m.key, msg: `GHL’s IP end (${m.ghl}) is before the contract date (${merged.accepted}) — fix it in GHL, or change the IP days here.` }); return; }
      fields = { ddDays: daysBetween(merged.accepted, m.ghl) };
    }
    setFixing(m.key); setErr(null); setFixErr(null);
    try {
      const d = await saveDeal(id, { fields, fixed: {} }, base);
      setBase(d.updatedAt);
      setDraft((dr) => ({ ...dr, fields: Object.fromEntries(Object.entries(dr.fields).filter(([k]) => !(k in fields))) }));
    } catch (e) { setFixErr({ key: m.key, msg: e.message }); } finally { setFixing(null); }
  }
  // Two small links under the next step (Luke, Oct 23: "a small link button
  // at the bottom … cleaner"): the side the next step points at first.
  const fixRow = (m) => {
    const row = mismatchRow(m);
    if (isNew || !mayFix(m)) return row;
    const sent = (pushes || []).find((p) => p.field === m.key && p.status !== 'done' && !p.error);
    const cancelAs = String(merged.cancelAs || '').toUpperCase();
    const noPush = m.key === 'status' && m.tracker === 'CANCELLED' && !cancelAs;
    const busyNow = fixing === m.key;
    const link = 'underline underline-offset-2 text-violet-800 hover:text-violet-950 disabled:opacity-50 disabled:no-underline';
    const toGhl = noPush ? null : sent
      ? <span className="text-zinc-500">✓ Sent to GHL</span>
      : <button type="button" disabled={busyNow} onClick={() => fixToGhl(m)} className={link}>Update GHL ↑</button>;
    const toSite = <button type="button" disabled={busyNow} onClick={() => fixToSite(m)} className={link}>Update site ↓</button>;
    const first = m.key === 'status' && m.fix === 'tracker' ? [toSite, toGhl] : [toGhl, toSite];
    if (m.key === 'status' && m.tracker === 'CANCELLED' && cancelAs) row.next = `Mark it ${cancelAs === 'LOST' ? 'Lost' : 'Abandoned'} in GHL`;
    return {
      ...row,
      extra: <span className="inline-flex flex-wrap gap-x-3 text-[12.5px]">{first.filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}{fixErr?.key === m.key && <span className="basis-full text-red-700 no-underline">{fixErr.msg}</span>}</span>,
    };
  };
  async function confirmCancel(fields) {
    setBusy(true); setErr(null);
    try {
      const d = await saveDeal(id, { fields: { ...draft.fields, ...fields }, fixed: draft.fixed }, base);
      setBase(d.updatedAt);
      setDraft({ fields: {}, fixed: {} });
      setCancelAsk(false);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setErr(null);
    try {
      if (isNew) {
        if (!merged.address) throw new Error('Add the property address first.');
        const fields = Object.fromEntries(Object.entries({ ...initial, ...draft.fields }).filter(([, v]) => v != null && v !== ''));
        const d = await createDeal(fields);
        onCreated?.(d.id);
      } else {
        const d = await saveDeal(id, draft, base);
        setBase(d.updatedAt);
        setDraft({ fields: {}, fixed: {} });
      }
      return true;
    } catch (e) { setErr(e.message); return false; } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${merged.address}? It stays in the change history.`)) return;
    try { await deleteDeal(id); onClose(); } catch (e) { setErr(e.message); }
  }

  const pay = owner ? payouts(merged, s.rules) : [];
  const past = { buyer: pastValues(s.raw, 'buyer'), title: pastValues(s.raw, 'title') };
  // Reps and managers (Luke, Oct 14): Contract, Title, EMD, Due diligence and
  // Dispositions only, without Net loss % (the server strips the rest too).
  const visible = (f) => (ro ? repSees(f) : owner || !f.secret);
  const groups = GROUPS.filter(([gid]) => FIELDS.some((f) => f.group === gid && visible(f)));
  const vpg = typeof merged.vpgAssign === 'number' && merged.vpgAssign > 0;
  // Summary tile, frozen at the top (Luke, Oct 19: "the deal status at a
  // glance"): row 1 the money — contracted, assignment, gross assignment (reps
  // keep gross, Oct 14); row 2 the dates and EMD — COE, the inspection period
  // from contract date to IP end (with its time), and EMD status + who placed it.
  const dash = <span className="text-zinc-300">—</span>;
  const ts = tileStatus(merged);
  const grossOk = typeof merged.grossAssign === 'number' && !noBuyer(merged);
  // Sections (S2): which are visible to this person, which is "you are here",
  // which are open.
  const secs = SECTIONS.map((x) => ({ ...x, groups: x.groups.filter((gid) => groups.some(([g2]) => g2 === gid)) })).filter((x) => x.groups.length);
  const here = isNew ? null : (secs.find((x) => x.id === HERE[stageOf(merged)]) || secs[0])?.id;
  const missingIn = (sec) => FIELDS.filter((f) => sec.groups.includes(f.group) && need.has(f.key)).length;
  const defaultOpen = isNew ? secs.map((x) => x.id) : secs.filter((x) => x.id === here || missingIn(x) > 0).map((x) => x.id);
  const openList = [...new Set([...(userOpen || defaultOpen), ...forced])];
  const toggle = (sid) => {
    const next = openList.includes(sid) ? openList.filter((x) => x !== sid) : [...openList, sid];
    setForced((f) => f.filter((x) => x !== sid));
    setUserOpen(next);
    if (id) writeOpen(id, next);
  };
  const showSec = (sid) => {
    setForced((x) => (x.includes(sid) ? x : [...x, sid]));
    setTimeout(() => { const el = bodyRef.current?.querySelector(`#deal-s-${sid}`); if (el) { bodyRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' }); setOnSec(sid); } }, 30);
  };
  const groupGrid = (gid) => (
                  <div className={`grid ${gid === 'dd' ? 'grid-cols-3' : 'grid-cols-2'} gap-x-3 ${ro ? 'gap-y-1.5' : 'gap-y-2'} px-2 py-2`}>
                    {FIELDS.filter((f) => f.group === gid && visible(f) && f.key !== 'ddEndTz' && f.key !== 'ddStart' && (f.key !== 'originalPrice' || String(merged.retrade || '').toUpperCase() === 'Y' || merged.originalPrice != null) && (f.key !== 'emdLostWhy' || String(merged.emdReturned || '').toUpperCase() === 'LOST' || merged.emdLostWhy != null) && (f.key !== 'cancelAs' || String(merged.status || '').toUpperCase() === 'CANCELLED' || merged.cancelAs != null) && (f.key !== 'cancelReason' || String(merged.status || '').toUpperCase() === 'CANCELLED' || merged.cancelReason != null) && (f.key !== 'emdKept' || String(merged.status || '').toUpperCase() === 'CANCELLED' || merged.emdKept != null)).sort((a, b) => (a.key === 'ddEnd' ? -1 : b.key === 'ddEnd' ? 1 : 0)).map((f) => {
                      // Due diligence (Luke, Oct 16: "start and end on same line. time
                      // somewhere else"): the dates as one line on top, then the days
                      // and the end time with its zone side by side.
                      if (f.key === 'ddEnd') {
                        const tone = need.has('ddEnd') || need.has('ddStart') ? 'need' : !isNew && !ro && (flagged.has('ddEnd') || flagged.has('ddStart')) && step.tone !== 'green' ? 'check' : 'plain';
                        return (
                          <div key="dd-dates" id="deal-f-ddEnd" className={`col-span-3 min-w-0 scroll-mt-24 ${BOX} ${BOX_TONE[tone]}`}>
                            <span id="deal-f-ddStart" className="sr-only">Inspection period dates</span>
                            {tone !== 'plain' && <span className={`inline-block mb-1 rounded px-1 text-[10.5px] font-semibold ${tone === 'need' ? 'bg-[#FDECEA] text-[#B42318]' : 'bg-[#FEF0C7] text-[#B54708]'}`}>{tone === 'need' ? 'needed' : 'check this'}</span>}
                            <DdTimeline d={merged} />
                            {!fro('ddDays') && (
                              // Change the IP end by its date (Luke, Oct 18) — saved as the DD days from the contract date.
                              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-tan-100 pt-2 text-[12.5px] text-zinc-600">
                                <span className="font-medium">Change the IP end date</span>
                                {ISO.test(merged.accepted || '') ? (
                                  <input type="date" value={merged.ddEnd || ''} min={merged.accepted} onChange={(e) => { const v = e.target.value; if (ISO.test(v)) setField('ddDays', Math.round((Date.parse(v) - Date.parse(merged.accepted)) / 86_400_000)); }}
                                    className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-navy-800" />
                                ) : <span className="text-zinc-400">set the contract acceptance date first</span>}
                                <span className="text-zinc-400">sets the IP days · sent to GHL on save</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      // Read-only: the timeline already says the days and the end time.
                      if (fro(f.key) && (f.key === 'ddDays' || f.key === 'ddEndTime')) return null;
                      const wide = (f.type === 'longtext' || f.key === 'address') && !PICK_FROM_PAST.has(f.key);
                      const isFixed = f.calc && (draft.fixed[f.key] !== undefined ? draft.fixed[f.key] !== 'formula' : raw.fixed && f.key in raw.fixed);
                      const changed = f.key in draft.fields || f.key in draft.fixed;
                      const value = f.key in draft.fields ? draft.fields[f.key] : raw[f.key];
                      const text = (v) => (isBlank(v) ? <span className="text-zinc-300">—</span> : <span className={f.type === 'longtext' || f.key === 'title' ? 'whitespace-pre-line' : ''}>{show(f, v, merged)}</span>);
                      // Bookkeeping stays locked until the COE date (Luke, Oct 14).
                      const locked = BOOKS_KEYS.includes(f.key) && !booksOpen(merged);
                      const reprice = f.key === 'price' && retradePending(merged);
                      const lossHigh = f.key === 'netLoss' && netLossHigh(merged);
                      const check = !isNew && !ro && flagged.has(f.key) && step.tone !== 'green';
                      const tone = reprice ? (flash ? 'flash' : 'retrade') : need.has(f.key) ? 'need' : check ? 'check' : lossHigh ? 'alert' : 'plain';
                      return (
                        <label key={f.key} id={`deal-f-${f.key}`} className={`${wide || (ro && f.key === 'title') || f.key === 'ddEndTime' ? 'col-span-2' : ''} min-w-0 scroll-mt-24 ${BOX} ${BOX_TONE[tone]}`} style={lossHigh ? { background: ALERT.background } : undefined}>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-medium text-zinc-500 mb-1">
                            {f.key === 'ddEndTime' ? 'End time & time zone' : f.key === 'ddDays' ? 'Length (days)' : f.label}
                            {changed && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Changed" />}
                            {reprice ? <span className="text-[10.5px] font-semibold text-amber-800">● Re-enter the new price after the retrade</span>
                              : need.has(f.key) ? <span className="rounded px-1 text-[10.5px] font-semibold bg-[#FDECEA] text-[#B42318]">needed</span>
                                : check ? <span className="rounded px-1 text-[10.5px] font-semibold bg-[#FEF0C7] text-[#B54708]">check this</span> : null}
                            {lossHigh && <span className="text-[10.5px] font-semibold text-[#B42318]">● over 20%</span>}
                            {locked && <span className="text-[10.5px] font-normal text-zinc-400" title="Bookkeeping can be filled in once the COE date is reached or the deal is closed">locked · unlocks at COE</span>}
                            {f.calc && !isFixed && <span className="text-[10.5px] font-normal text-zinc-400">auto</span>}
                            {f.type === 'ghl' && <span className="text-[10.5px] font-normal text-violet-600">from GHL</span>}
                            {f.fin && <span className="text-[10.5px] font-normal text-emerald-700">from Finance</span>}
                            {isFixed && <span className="text-[10.5px] rounded bg-amber-100 text-amber-800 px-1" title="Typed by hand (in the sheet or here) — doesn't recalculate">typed</span>}
                          </span>
                          {f.calc || f.fin || f.type === 'ghl' ? (
                            <div className={`flex items-center gap-2 ${ro ? '' : 'min-h-8'}`}>
                              <span className={`tabular-nums ${ro ? 'text-[14.5px] font-semibold' : 'text-[14px] font-medium'} ${isFixed ? 'text-amber-900' : lossHigh ? 'text-[#B42318] font-bold' : ro ? 'text-navy-900' : 'text-zinc-900'}`}>{!isFixed && NEEDS_BUYER.has(f.key) && noBuyer(merged) ? <span className="text-zinc-400 font-normal">no buyer yet</span> : show(f, merged[f.key])}</span>
                              {fin && partOfField(f.key) && <PayTag line={fin.parts[partOfField(f.key)]} />}
                              {isFixed && !ro && (owner || !f.secret) && <button type="button" onClick={(e) => { e.preventDefault(); setFixed(f.key, 'formula'); }} className="text-xs text-blue-600 hover:underline">use formula</button>}
                            </div>
                          ) : f.key === 'links' && ro ? (
                            <LinkList value={value} address={merged.address} />
                          ) : fro(f.key) || locked ? (
                            <div className={`${ro ? 'text-[14.5px] font-semibold text-navy-900' : 'min-h-8 flex items-center text-[14px] font-medium text-zinc-500'} tabular-nums`}>{text(value)}</div>
                          ) : (
                            <>
                              {f.key === 'ddEndTime' ? (
                                // End time and its time zone on one line (Luke, Oct 15: the zone
                                // fell to a row of its own and read as a separate field).
                                <div className="flex gap-2">
                                  <div className="flex-1 min-w-0"><Input f={f} lists={s.lists} disabled={fro(f.key)} deal={merged} value={value} onChange={(v) => setField(f.key, v)} /></div>
                                  <div className="w-40 shrink-0"><Input f={TZ_FIELD} lists={s.lists} disabled={fro('ddEndTz')} deal={merged} value={'ddEndTz' in draft.fields ? draft.fields.ddEndTz : raw.ddEndTz} onChange={(v) => setField('ddEndTz', v)} /></div>
                                </div>
                              ) : <Input f={f} lists={s.lists} disabled={fro(f.key)} deal={merged} past={PICK_FROM_PAST.has(f.key) ? past[f.key] : null} value={value} onChange={(v) => setField(f.key, v)} />}
                              {f.key === 'links' && <LinkList value={value} address={merged.address} onUse={(u) => setField('links', u)} small />}
                              {f.key === 'commPaid' && fin && fin.total > 0 && <span className="block mt-1 text-[11.5px] text-zinc-500">Finance: {fin.paid} of {fin.total} commission{fin.total === 1 ? '' : 's'} paid — set automatically when a payout is marked paid in <a {...linkProps('/finance/money')} className="text-navy-700 underline">Finance</a>.</span>}
                              {f.key === 'originalPrice' && <span className="block mt-1 text-[11.5px] text-zinc-400">Price before the retrade — for reference, not used in any math.</span>}
                            </>
                          )}
                        </label>
                      );
                    })}
                  </div>
  );
  // The Money (owners / TC): from the price to the profit, top to bottom.
  const moneyRows = (() => {
    if (ro) return null;
    const rows = [];
    const add = (label, v, kind) => rows.push({ label, v, kind });
    const lostEmd = ['NO', 'LOST'].includes(String(merged.emdReturned || '').toUpperCase()) ? Number(merged.emd) || 0 : 0;
    if (keptMoney(merged)) {
      add("Buyer's EMD we kept", merged.emdKept);
      if (lostEmd) add('Our EMD lost', -lostEmd, 'minus');
    } else if (stageOf(merged) === 'CANCELLED') {
      return { cancelled: true, lostEmd, profit: merged.netProfit };
    } else if (noBuyer(merged)) {
      return { none: true };
    } else {
      add('Assigned at', merged.vpgAssign);
      if (merged.grossAssign !== merged.vpgAssign) add('Contracted price', -(Number(merged.price) || 0), 'minus');
    }
    add('Gross assignment', merged.grossAssign, 'sum');
    if (Number(merged.addlFees)) add('Additional fees', -Number(merged.addlFees), 'minus');
    add('Net assignment', merged.netAssign, 'sum');
    if (owner) {
      for (const p of pay) add(`${p.part[0].toUpperCase()}${p.part.slice(1)} · ${first(p.who)}`, -p.amount, 'minus');
      add('Net profit', merged.netProfit, 'total');
    }
    return { rows };
  })();
  const moneyBox = moneyRows && (
    <div className="mx-2 mt-2 rounded-lg border border-tan-200 bg-tan-50/60 px-3.5 py-2.5 text-[13.5px] tabular-nums">
      {moneyRows.none ? <span className="text-zinc-500">No buyer yet — the money fills in once the deal is assigned.</span>
        : moneyRows.cancelled ? <span className="text-zinc-600">Cancelled{moneyRows.lostEmd ? <> · our EMD lost <span className="font-semibold text-[#B42318]">−{money(moneyRows.lostEmd)}</span></> : ' · no money in or out'}</span>
          : moneyRows.rows.map((r, i) => (
            <div key={i} className={`flex justify-between gap-3 py-1 ${r.kind === 'total' ? 'border-t-2 border-navy-700 mt-1 pt-1.5 font-bold text-navy-800' : r.kind === 'sum' ? 'border-t border-tan-200 font-semibold text-navy-800' : 'text-zinc-700'}`}>
              <span>{r.label}</span>
              <span className={r.kind === 'minus' ? 'text-[#B42318]' : r.kind === 'total' ? (Number(r.v) >= 0 ? 'text-[#15803d]' : 'text-[#B42318]') : ''}>{r.kind === 'minus' ? `− ${money(-r.v)}` : money(r.v)}</span>
            </div>
          ))}
    </div>
  );
  const sectionCard = (sec, si) => {
    const open = openList.includes(sec.id);
    const n = missingIn(sec);
    const isHere = sec.id === here;
    if (!open) {
      return (
        <button key={sec.id} id={`deal-s-${sec.id}`} data-sec={sec.id} type="button" onClick={() => toggle(sec.id)}
          className="scroll-mt-3 w-full text-left flex items-center gap-3 rounded-xl border border-tan-300 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(27,56,95,0.08)] hover:border-navy-300 hover:bg-tan-50/40">
          <span className={PANEL_NUM}>{si + 1}</span>
          <span className="font-semibold text-navy-800 text-[14px] shrink-0">{sec.label}</span>
          <span className="flex-1 min-w-0 truncate text-[13px] text-zinc-500">{summaryOf(sec.id, merged, { owner, ro })}</span>
          {n > 0 ? <span className="shrink-0 rounded-full bg-[#FDF1F0] text-[#B42318] px-2 py-0.5 text-[11.5px] font-bold">{n} missing</span>
            : <span className="shrink-0 rounded-full bg-[#ECFDF3] text-[#15803d] px-2 py-0.5 text-[11.5px] font-bold">✓</span>}
          <span className="shrink-0 text-[12.5px] font-semibold text-navy-700 underline underline-offset-2">{ro ? 'Show' : 'Edit'} ▸</span>
        </button>
      );
    }
    return (
      <section key={sec.id} id={`deal-s-${sec.id}`} data-sec={sec.id} className="scroll-mt-3 rounded-xl border border-tan-300 bg-white shadow-[0_2px_8px_rgba(27,56,95,0.10)] overflow-hidden">
        <h3 className={`flex items-center gap-2.5 px-4 py-2.5 ${PANEL_HEAD}`}>
          <span className={PANEL_NUM}>{si + 1}</span>
          <span className="text-[14px] font-semibold text-white">{ro && sec.id === 'notes' ? 'Zillow Link' : sec.label}</span>
          {isHere && <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tan-400">You are here</span>}
          <span className="ml-auto flex items-center gap-2">
            {n > 0 && <span className="rounded-full bg-[#FDF1F0] text-[#B42318] px-2 py-0.5 text-[11.5px] font-bold">{n} missing</span>}
            <button type="button" onClick={() => toggle(sec.id)} className="text-[12px] font-semibold text-white/75 hover:text-white">Fold ▴</button>
          </span>
        </h3>
        {sec.id === 'money' && moneyBox}
        {sec.groups.map((gid) => (
          <div key={gid} id={`deal-g-${gid}`} className={sec.groups.length > 1 ? 'border-t border-tan-100 first-of-type:border-t-0' : ''}>
            {sec.groups.length > 1 && <div className="px-4 pt-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-tan-700">{SUB_LABEL[gid]}</div>}
            {groupGrid(gid)}
          </div>
        ))}
      </section>
    );
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" onClick={close} />
      <section className="relative w-full max-w-[760px] h-full bg-tan-100 shadow-2xl flex flex-col" role="dialog" aria-label={merged.address || 'New deal'}>
        {!isNew && <span className={`absolute left-0 top-0 bottom-0 w-1 z-10 ${TONES[step.tone].bar}`} />}
        <header className="shrink-0 bg-navy-700 text-white px-6 pt-5 pb-0 relative overflow-hidden">
          <svg viewBox="0 0 1000 1000" className="absolute -right-10 -top-16 w-60 h-60 opacity-[0.07] pointer-events-none" aria-hidden="true"><path d="M320 108 L653 686 L535 890 L203 314 Z" fill="#fff" /><path d="M514 308 H693 A104 104 0 0 1 783 464 L693 618 Z" fill="#ad9b7a" /></svg>
          <div className="flex items-start gap-3 relative">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">{isNew ? 'New deal' : `Deal · ${merged.acq || 'no acq. manager'}`}{ro && (editable.size ? ' · you can fix the COE, IP end and EMD' : ' · view only')}</div>
              <h2 className="mt-1 text-[22px] font-semibold tracking-tight break-words">{merged.address || 'New deal'}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <StatusChip status={merged.status} />
                {keptMoney(merged) && <span title="Cancelled — the buyer's EMD was kept. Commissions are paid on it like a closing." className="rounded-md bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 px-2 py-0.5 text-[12px] font-semibold">{money(merged.netAssign)} kept · buyer's EMD</span>}
                {!isNew && !step.done && <StepPill step={step} />}
                <GhlChip g={g} />
                {!isNew && (
                  <span className="text-[12px] text-white/75 ml-1" title={raw.ghlSub?.location ? `GHL location ${raw.ghlSub.location}` : 'No GHL opportunity is linked to this deal'}>
                    {raw.ghlSub ? <>GHL sub-account: <span className="font-semibold text-white">{[raw.ghlSub.rep || 'unknown', raw.ghlSub.market].filter(Boolean).join(' · ')}</span></> : 'Not linked to GHL'}
                  </span>
                )}
              </div>
            </div>
            <button onClick={close} className="text-white/60 hover:text-white text-2xl leading-none px-1" aria-label="Close">×</button>
          </div>
          {!isNew && (
            <nav className="flex gap-5 mt-4 relative">
              {[['details', 'Details'], ['history', 'History']].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`pb-2.5 border-b-[3px] font-medium ${tab === k ? 'border-tan-400 text-white' : 'border-transparent text-white/60 hover:text-white'}`}>{l}</button>
              ))}
            </nav>
          )}
        </header>
        {!isNew && tab === 'details' && (
          <div className="shrink-0 border-b border-tan-200">
            <div className="px-5 pt-2.5 pb-3 bg-tan-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-navy-700">Deal Status</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${TILE_TONE[ts.band[0]].pill}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{ts.band[1]}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatusTile icon="pen" label="Contracted">{retradePending(merged) ? <span className="text-amber-700 text-[14px]" title="Retraded — type in the new contracted price">Re-enter</span> : money(merged.price)}</StatusTile>
                <StatusTile icon="arrow" label="Assigned at">{vpg ? money(merged.vpgAssign) : <span className="text-zinc-400 font-medium text-[14px]">no buyer yet</span>}</StatusTile>
                <StatusTile icon="trend" label="Gross" tone={grossOk ? 'ok' : 'plain'}>{grossOk ? <span className="text-[#15803d]">{money(merged.grossAssign)}</span> : dash}</StatusTile>
                <StatusTile icon="shield" label="EMD" tone={ts.emd[0]} word={ts.emd[1]}>{merged.emd ? money(merged.emd) : dash}</StatusTile>
                <StatusTile icon="search" label="Inspection" tone={ts.ip[0]} word={ts.ip[1]}>{merged.accepted || merged.ddEnd ? <IpSpan d={merged} /> : dash}</StatusTile>
                <StatusTile icon="cal" label="COE" tone={ts.coe[0]} word={ts.coe[1]}>{merged.coe ? shortDate(merged.coe) : dash}</StatusTile>
              </div>
            </div>
          </div>
        )}

        {!isNew && tab === 'details' && (
          <nav className="shrink-0 flex flex-wrap gap-x-0.5 gap-y-1 bg-navy-700 border-y border-navy-800 px-3 py-1.5" aria-label="Jump to a section">
            {secs.map((sec) => {
              const missing = missingIn(sec) > 0;
              return (
                <button key={sec.id} type="button" onClick={() => showSec(sec.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold whitespace-nowrap ${onSec === sec.id ? 'bg-tan-500 text-navy-900 shadow' : 'text-white/80 hover:text-white hover:bg-white/10'}`}>
                  {ro && sec.id === 'notes' ? 'Zillow Link' : sec.short}
                  {missing && <span className="w-1.5 h-1.5 rounded-full bg-[#F04438] ring-1 ring-white/70" title="Something is needed here" />}
                </button>
              );
            })}
          </nav>
        )}

        <div ref={bodyRef} onScroll={(e) => { const box = e.currentTarget; const secs = [...box.querySelectorAll('[data-sec]')]; let cur = null; for (const el of secs) { if (el.offsetTop - 40 <= box.scrollTop) cur = el.dataset.sec; } if (secs.length && box.scrollTop + box.clientHeight >= box.scrollHeight - 4) cur = secs[secs.length - 1].dataset.sec; setOnSec(cur); }} className="relative flex-1 overflow-y-auto px-6 py-5">
          {tab === 'history' ? <div className="rounded-xl border border-tan-200 bg-white px-4"><History id={id} /></div> : (
            <div className="flex flex-col gap-4">
              {/* Only when GHL and the site disagree (Luke, Oct 23: "why does the GHL info pop up? looks like it matches"). */}
              {(miss.length > 0 || (g && g.coe && !ro && !ISO.test(merged.coe || ''))) && (
                <Notice tone="violet">
                  {g ? <div className="font-medium">In GoHighLevel: <StageChip stage={g.stage} /> · {g.repName}</div>
                    : <div className="font-medium">In GoHighLevel: <StageChip stage={merged.ghlStage} /></div>}
                  {g && <div className="text-[12.5px] mt-0.5">IP end {shortDate(g.ipEnd)} · COE {shortDate(g.coe)}{g.value ? ` · value ${money(g.value)}` : ''}
                    {g.coe && !ro && !ISO.test(merged.coe || '') && <> · <button onClick={() => setField('coe', g.coe)} className="underline">use GHL's COE</button></>}
                  </div>}
                  {/* What doesn't match the tracker (Luke, Oct 16). */}
                  {miss.length > 0 && (
                    <div className="mt-2.5">
                      <MismatchList rows={miss.map(fixRow)} />
                    </div>
                  )}
                  <PushNote pushes={pushes} />
                </Notice>
              )}
              {!(miss.length > 0 || (g && g.coe && !ro && !ISO.test(merged.coe || ''))) && <PushNote pushes={pushes} boxed />}
              {ip && (
                <div className={`rounded-lg border px-3.5 py-2.5 ${ip.tone === 'red' ? 'border-[#F5C2BD] bg-[#FDF1F0] text-[#7A271A]' : 'border-[#F5D9A8] bg-[#FFF8E6] text-[#7A4A06]'}`}>
                  <div className="font-semibold">{ip.text}</div>
                  <div className="text-[12.5px] mt-0.5">The inspection period ends {new Date(ip.at).toLocaleString('en-US', { timeZone: 'America/Phoenix', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} Arizona time ({showEndTime(merged) || 'end of day'}) and the deal hasn't been moved to Assigned yet.</div>
                </div>
              )}
              {needs.length > 0 && (
                <div className="rounded-lg border border-[#F5C2BD] bg-[#FDF1F0] px-3.5 py-2.5 text-[#7A271A]">
                  <div className="font-semibold">Needs info — {need.size} field{need.size === 1 ? '' : 's'} to fill in</div>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {needs.map(({ cat, fields }) => (
                      <div key={cat.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[12.5px] font-medium">{cat.label}:</span>
                        {fields.map((k) => (
                          <button key={k} type="button" onClick={() => goField(k)} className="rounded px-1.5 py-0.5 text-[11.5px] font-medium bg-[#FDECEA] text-[#B42318] ring-1 ring-inset ring-[#F5C2BD] hover:bg-[#FBD9D5]">{LABEL[k]}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {warn.length > 0 && <Notice tone="amber"><ul className="list-disc pl-4 space-y-0.5">{warn.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
              {secs.map((sec, si) => sectionCard(sec, si))}
              {!isNew && owner && (
                <div className="pt-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>Last changed {raw.updatedBy ? `by ${raw.updatedBy}` : ''} {raw.updatedAt ? new Date(raw.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                  <button onClick={remove} className="text-red-600 hover:underline">Delete deal</button>
                </div>
              )}
            </div>
          )}
        </div>

        {(dirty || err) && (!ro || editable.size > 0) && tab === 'details' && (
          <footer className="shrink-0 border-t border-tan-200 px-6 py-3 flex items-center gap-3 bg-white">
            {err ? <span className="text-red-700 text-[12.5px] flex-1">{err}</span> : <span className="text-zinc-500 flex-1">{isNew ? 'New deal — not saved yet' : `${nChanges} unsaved change${nChanges === 1 ? '' : 's'}`}</span>}
            {!isNew && <button onClick={() => { setDraft({ fields: {}, fixed: {} }); setErr(null); }} className={btnCls}>Discard</button>}
            <button onClick={save} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : isNew ? 'Add deal' : 'Save'}</button>
          </footer>
        )}
        {cancelAsk && <CancelDialog deal={merged} busy={busy} err={err} onBack={() => { setCancelAsk(false); setErr(null); }} onConfirm={confirmCancel} />}
        {leaving && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-navy-900/40 p-6" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title">
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl border border-tan-200 p-5">
              <h2 id="unsaved-title" className="text-[16px] font-semibold text-navy-800">You have {nChanges} unsaved change{nChanges === 1 ? '' : 's'}</h2>
              <p className="mt-1.5 text-[13.5px] text-zinc-600">Save them before leaving this deal, or they'll be lost.</p>
              {err && <p className="mt-2 text-[12.5px] text-red-700">{err}</p>}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button autoFocus onClick={() => setLeaving(null)} className={btnCls}>Keep editing</button>
                <button onClick={() => { const go = leaving; setLeaving(null); setDraft({ fields: {}, fixed: {} }); go(); }} className={`${btnCls} text-red-700`}>Discard</button>
                <button disabled={busy} onClick={async () => { const go = leaving; if (await save()) { setLeaving(null); go(); } }} className={primaryCls}>{busy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
