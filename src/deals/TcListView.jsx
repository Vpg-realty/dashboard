// Deals › TC List — the "TC Desk" (Luke, Oct 26, from the approved mock-up;
// reworked Oct 27 and Oct 28: "streamline this entire list … the property
// address in a classic blue header to match all of the other headers … a
// fold option … each line item narrower").
//
// The navy band's counters are All Deals' filters (Urgent = something late
// or due today, Closing This Week, Open Issues). The site's left rail:
// All Deals (on top), My Day (the default — only what's late, due today or
// due tomorrow). The search sits at the head of the list it
// searches. My Day = one card per property: the site's navy header band
// (address, rep · sub-account, stage, COE, how many items, Checklist / Flag
// in the tan corner; a click folds it, kept per device `vpg.tc.fold`), then
// one slim line per item (due chip, the step, how to do it, ✓ Done). All
// Deals is one line per deal with "Where It Stands" and a dot per milestone.
// A card's Checklist, its address or a table row opens the deal panel on its
// TC Checklist tab (`?deal=<id>&tab=tc`; old `?card=` links land there). The steps themselves live in tcList.js (CHECKLIST). D1
// via /api/tc (ticks, tasks, issues — Flag an Issue alerts the owners and the
// deal's acq rep and dispo rep). Deals open in the deal panel.
import { useEffect, useMemo, useState } from 'react';
import { useDeals, saveDeal } from './store.js';
import { useTc } from './tcStore.js';
import { buildTcCards, CHECKLIST, REMOVED, MILESTONES, ISSUE_KINDS, issueLabel, email48, standing, milestone, vpgPlacedEm, firstLine, NA } from './tcList.js';
import { Loading, StatusChip, CoeChip, PageHead, CrossLink } from './ui.jsx';
import { isOpen } from './math.js';
import SearchBox from '../shell/SearchBox.jsx';
import { PANEL_HEAD } from '../shell/panelStyle.js';
import BandCounter from '../shell/BandCounter.jsx';
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';
import RepTag from '../shell/RepTag.jsx';
import { dealTag, urgency } from './urgency.js';
import { personColor } from './personColor.js';
import { shortDate, primaryCls, btnCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';

const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const up = (x) => String(x ?? '').trim().toUpperCase();
const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
// "the owners, Sam and Cayden" — who a flagged issue alerts.
const whoGets = (d) => { const p = [...new Set([d.acq, d.dispoMember].filter(Boolean))]; return p.length ? `the owners, ${p.join(' and ')}` : 'the owners'; };
const VIEWS = new Set(['day', 'all']);
// All Deals' filters (Luke, Oct 28: "filter the all deals tab to show what is
// closing this week as well as which properties have action items that are
// urgent") — the band counters pick them.
// Open Issues is one too (Oct 28: "make it a filter on the all deals").
const FILTERS = { urgent: 'Urgent', closing: 'Closing This Week', issues: 'Open Issues' };
const FOLD_KEY = 'vpg.tc.fold';
const readFold = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]')); } catch { return new Set(); } };
const saveFold = (set) => { try { localStorage.setItem(FOLD_KEY, JSON.stringify([...set])); } catch { /* private window */ } };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* nothing */ }
    t.remove(); return ok;
  }
}
function CopyButton({ text, label = 'Copy', big }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1800); } }} className={`${big ? primaryCls : btnCls} whitespace-nowrap`}>{done ? '✓ Copied' : label}</button>;
}


// Ticks that are really deal fields (Luke, Oct 15: "any edit anywhere should
// automatically populate the deal sheet"): EMD sent asks who placed it and
// saves EMD paid by (+ EMD sent on today when empty); Escrow opened asks for
// the escrow # (and the title agency when none is on file) and saves them;
// Buyer EM receipt saves EMD paid by Buyer (VPG + Buyer when VPG had placed
// it); VPG's EMD returned saves EMD returned = Yes.
function useTick(d, post) {
  const [ask, setAsk] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async (fields) => {
    setSaving(true);
    try { await saveDeal(d.id, { fields }, d.updatedAt); return true; } catch (e) { window.alert(e.message); return false; } finally { setSaving(false); }
  };
  const tick = async (it, v) => {
    if (v && it.id === 'em' && !it.auto) { setAsk('em'); return; }
    if (v && it.id === 'title' && !it.auto) { setAsk('title'); return; }
    if (v && it.id === 'buyerem' && !it.auto) { await save({ emdPaidBy: /VPG/.test(up(d.emdPaidBy)) ? 'VPG + BUYER' : 'BUYER' }); return; }
    if (v && it.id === 'emret' && vpgPlacedEm(d)) { await save({ emdReturned: 'YES' }); return; }
    await post({ action: 'check', dealId: d.id, item: it.id, done: v });
  };
  return { ask, setAsk, saving, tick, save };
}

function LinkAsk({ kind, d, save, onDone }) {
  const [escrow, setEscrow] = useState('');
  const [title, setTitle] = useState('');
  const opt = 'h-8 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] font-semibold text-navy-800 hover:bg-navy-50';
  const sent = d.emdSent ? {} : { emdSent: laToday() };
  const go = async (fields) => { if (await save(fields)) onDone(); };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-navy-50 px-3 py-2">
      {kind === 'em' && <>
        <span className="text-[13px] text-zinc-700">Who placed the EMD? (saved on the deal)</span>
        {[['VPG', 'VPG'], ['BUYER', 'Buyer'], ['VPG + BUYER', 'VPG + Buyer']].map(([k, l]) => <button key={k} type="button" className={opt} onClick={() => go({ emdPaidBy: k, ...sent })}>{l}</button>)}
      </>}
      {kind === 'title' && <>
        {!firstLine(d.title) && <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title agency" className="h-8 w-52 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px]" />}
        <input autoFocus value={escrow} onChange={(e) => setEscrow(e.target.value)} placeholder="Escrow #" className="h-8 w-36 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px]" />
        <button type="button" disabled={!escrow.trim()} className={opt} onClick={() => go({ escrow: escrow.trim(), ...(title.trim() ? { title: title.trim() } : {}) })}>Save on the deal</button>
      </>}
      <button type="button" onClick={onDone} className="text-[12.5px] text-zinc-500 hover:underline">Cancel</button>
    </div>
  );
}

// Flag an Issue (Luke, Oct 26): what kind, a line on it; it goes to the
// owners and the deal's acq rep and dispo rep in Alerts.
function FlagDialog({ d, post, onClose }) {
  const [kind, setKind] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); const ok = await post({ action: 'flag', dealId: d.id, kind, text }); setBusy(false); if (ok) onClose(); };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-navy-900/45 p-6" role="dialog" aria-modal="true" aria-label="Flag an issue">
      <div className="w-full max-w-[520px] rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="bg-navy-700 text-white px-5 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">Flag an Issue</div>
          <div className="text-[17px] font-semibold mt-0.5">{d.address}</div>
          <p className="text-[12.5px] text-white/70 mt-0.5">Goes to {whoGets(d)} in Alerts. It stays on the deal in red until it’s resolved.</p>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {ISSUE_KINDS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`text-left rounded-lg px-3 py-2 text-[14px] font-medium ring-1 ${kind === k ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-200 hover:bg-tan-50'}`}>{l}</button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} placeholder={kind === 'other' ? 'What’s the issue? (needed)' : 'What’s going on? (optional — e.g. “2019 HELOC on title, not on the payoff”)'} className="rounded-lg border border-zinc-200 px-3 py-2 text-[13.5px]" />
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-tan-100 bg-tan-50">
          <button type="button" onClick={onClose} className={btnCls}>Cancel</button>
          <button type="button" disabled={busy || !kind || (kind === 'other' && !text.trim())} onClick={send} className="h-8 inline-flex items-center rounded-lg bg-[#B42318] px-3 font-semibold text-white hover:bg-[#912018] disabled:opacity-50">{busy ? 'Sending…' : '⚑ Flag It'}</button>
        </div>
      </div>
    </div>
  );
}

const CHIP = { late: 'bg-[#4c0519] text-white', today: 'bg-[#B42318] text-white', soon: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200' };

// One thing to do on a deal (a step, a task or a warning) — one slim line
// under the property's header (Luke, Oct 28: "each line item needs to be
// narrower and more streamlined").
function ItemRow({ r, today, post, onDeal }) {
  const d = r.deal;
  const { ask, setAsk, saving, tick, save } = useTick(d, post);
  const [busy, setBusy] = useState(false);
  const title = r.warn ? r.warn.text : r.step ? r.step.label : r.task.text;
  const how = r.warn ? r.warn.how : r.step ? r.step.how : `Task added by ${r.task.created_by}`;
  const box = r.warn ? (r.warn.red ? 'late' : 'today') : r.bucket;
  const chip = r.warn ? 'Now' : r.bucket === 'late' ? `${r.lateBy}d late` : r.dueOn === today ? 'Today' : 'Tomorrow';
  const done = async () => {
    setBusy(true);
    try { if (r.task) await post({ action: 'task', id: r.task.id, done: true }); else await tick(r.step, true); } finally { setBusy(false); }
  };
  const small = 'h-7 px-2.5 text-[12.5px]';
  return (
    <li className="px-4 py-2 border-t border-tan-100 first:border-t-0">
      <div className="flex items-center gap-3">
        <span className={`w-[74px] shrink-0 rounded px-1.5 py-0.5 text-center text-[11.5px] font-semibold ${CHIP[box]}`}>{chip}</span>
        <div className="min-w-0 flex-1 flex items-baseline gap-2">
          <span className={`shrink-0 text-[14px] font-semibold ${r.warn ? 'text-[#B42318]' : 'text-navy-900'}`}>{r.task && <span className="mr-1.5 rounded bg-sky-50 text-sky-800 ring-1 ring-sky-200 px-1.5 text-[11px] font-semibold align-middle">Task</span>}{title}</span>
          <span className="min-w-0 truncate text-[12.5px] text-zinc-500" title={how}>{how}</span>
        </div>
        {r.step?.mail && <CopyButton text={email48(d)} label="Copy Email" />}
        {r.step && !r.step.auto && <button type="button" onClick={() => post({ action: 'check', dealId: d.id, item: NA(r.step.id), done: true })} className="shrink-0 text-[12px] text-zinc-400 hover:text-navy-800 hover:underline">Not needed</button>}
        {r.warn ? <button type="button" onClick={() => onDeal(d.id)} className={`${primaryCls} ${small} shrink-0`}>Open Deal</button>
          : <button type="button" disabled={busy || saving} onClick={done} className={`${primaryCls} ${small} shrink-0`}>{busy || saving ? 'Saving…' : '✓ Done'}</button>}
      </div>
      {ask && <div className="mt-1.5 ml-[86px]"><LinkAsk kind={ask} d={d} save={save} onDone={() => setAsk(null)} /></div>}
    </li>
  );
}

// My Day: one card per property — the site's navy header band (address, rep ·
// sub-account, stage, COE, how many items), a click folds it; its items as
// slim lines under it.
function DayCard({ c, rows, today, post, onCard, onDeal, onFlag, folded, onFold }) {
  const d = c.deal;
  const tag = dealTag(d);
  const lateN = rows.filter((r) => r.bucket === 'late' || r.warn?.red).length;
  return (
    <article className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <header className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2 ${PANEL_HEAD} cursor-pointer select-none`} onClick={onFold} aria-expanded={!folded}>
        <span className={`text-white/70 text-[11px] transition-transform ${folded ? '-rotate-90' : ''}`}>▼</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onCard(d.id); }} title="Open the deal's checklist" className="text-[14.5px] font-semibold text-white hover:underline underline-offset-2">{d.address}</button>
        {tag && <RepTag label={tag.label} color={tag.color} className="!text-[11.5px]" />}
        <StatusChip status={d.status} />
        {d.coe && <span className="text-[12px] text-white/70">COE {shortDate(d.coe)}</span>}
        {c.issues.length > 0 && <span className="rounded bg-[#FDECEA] text-[#B42318] px-1.5 text-[11.5px] font-semibold">⚑ {c.issues.map((x) => issueLabel(x.kind)).join(' · ')}</span>}
        <span className="ml-auto text-[12px] text-white/70 tabular-nums">{rows.length} item{rows.length === 1 ? '' : 's'}{lateN ? <b className="ml-1 font-semibold text-rose-200">· {lateN} late</b> : ''}</span>
        <span className="flex items-center rounded-md bg-tan-500 text-navy-900 text-[12.5px] font-semibold ring-1 ring-inset ring-black/10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => onCard(d.id)} className="px-2.5 py-1 hover:bg-tan-400">Checklist</button>
          <span className="w-px self-stretch bg-navy-900/20" />
          <button type="button" onClick={() => onFlag(d)} className="px-2.5 py-1 hover:bg-tan-400">⚑ Flag</button>
        </span>
      </header>
      {!folded && <ul>{rows.map((r) => <ItemRow key={`${r.step?.id || r.task?.id || r.warn?.id}`} r={r} today={today} post={post} onDeal={onDeal} />)}</ul>}
    </article>
  );
}

function Empty({ children }) {
  return <div className="rounded-xl border border-tan-200 bg-white px-5 py-12 text-center text-[15px] font-medium text-[#15803D]">{children}</div>;
}

function DayHead({ label, n }) {
  return <h3 className="text-[13px] font-semibold text-navy-900">{label} <span className="font-normal text-zinc-500">· {n} {n === 1 ? 'property' : 'properties'}</span></h3>;
}

// Deal Overview (was All Deals — Luke, Oct 28): one line per deal, where it
// stands, a dot per milestone, and a Flagged column with its open issues.
const DOT = {
  ok: ['bg-emerald-50 text-emerald-700', '✓'], na: ['text-zinc-300', '—'], off: ['text-zinc-300', '·'],
  late: ['bg-[#B42318] text-white', '!'], today: ['bg-amber-600 text-white', '•'], wait: ['border-2 border-dashed border-tan-300 text-transparent', '·'],
};
function DealTable({ cards, today, onCard }) {
  if (!cards.length) return <Empty>Nothing here right now.</Empty>;
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-navy-700 text-white text-[12px]">
            <tr className="text-left">
              <th className="px-4 py-2.5 font-semibold">Property</th>
              <th className="px-3 py-2.5 font-semibold">Where It Stands</th>
              <th className="px-3 py-2.5 font-semibold">COE</th>
              {MILESTONES.map(([k, l]) => <th key={k} className="px-1.5 py-2.5 font-semibold text-center leading-tight">{l}</th>)}
              <th className="px-3 py-2.5 font-semibold">Flagged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tan-100">
            {cards.map((c) => {
              const d = c.deal;
              const st = standing(c, today);
              return (
                <tr key={d.id} onClick={() => onCard(d.id)} className="cursor-pointer hover:bg-tan-50">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 whitespace-nowrap"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: personColor(d.ghlSub?.rep || d.acq) }} title={d.acq || ''} /><b className="font-semibold text-navy-900">{String(d.address || '').split(',')[0]}</b></span>
                  </td>
                  <td className="px-3 py-2.5 min-w-[220px]">
                    <div className={`font-semibold ${st.tone === 'red' ? 'text-[#B42318]' : st.tone === 'amber' ? 'text-amber-800' : st.tone === 'green' ? 'text-[#15803D]' : 'text-navy-900'}`}>{st.head}</div>
                    <div className="text-[12px] text-zinc-500">{st.next}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{c.closed ? <StatusChip status={d.status} /> : <CoeChip coe={d.coe} today={today} />}</td>
                  {MILESTONES.map(([k, l, ids]) => {
                    const m = milestone(c, ids, today);
                    const [cls, ch] = DOT[m.state];
                    return <td key={k} className="px-1.5 py-2.5 text-center"><span title={`${l}: ${m.state === 'wait' && m.on ? `next due ${shortDate(m.on)}` : m.state === 'late' ? `late since ${shortDate(m.on)}` : m.state === 'ok' ? 'done' : m.state === 'na' ? 'not needed' : m.state === 'today' ? 'due today' : 'not started'}`} className={`inline-grid place-items-center w-6 h-6 rounded-full text-[12px] font-extrabold ${cls}`}>{ch}</span></td>;
                  })}
                  <td className="px-3 py-2.5">{c.issues.length ? <span title={c.issues.map((x) => `${issueLabel(x.kind)}${x.text ? ` — ${x.text}` : ''} (${x.created_by})`).join('\n')} className="inline-flex items-center gap-1 rounded-md bg-[#FDECEA] px-2 py-0.5 text-[12px] font-semibold text-[#B42318] whitespace-nowrap">⚑ {c.issues.length === 1 ? issueLabel(c.issues[0].kind).split(' (')[0] : `${c.issues.length} issues`}</span> : <span className="text-zinc-300">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 border-t border-tan-100 text-[12px] text-zinc-500">
        {[['ok', 'done'], ['late', 'late'], ['today', 'due today'], ['wait', 'coming up (hover for the date)'], ['na', 'not needed']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`inline-grid place-items-center w-5 h-5 rounded-full text-[11px] font-extrabold ${DOT[k][0]}`}>{DOT[k][1]}</span>{l}</span>)}
        <span>· the dot before each address is the rep’s colour · click a row for the deal’s checklist</span>
      </div>
    </section>
  );
}

// Open Issues: one quiet line per issue (Luke, Oct 27: "a little busy").
function IssuesView({ cards, post, onCard }) {
  const list = cards.flatMap((c) => c.issues.map((x) => ({ c, x })));
  if (!list.length) return <Empty>✓ No open issues</Empty>;
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden divide-y divide-tan-100">
      {list.map(({ c, x }) => (
        <div key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
          <button type="button" onClick={() => onCard(c.deal.id)} title="Open the deal's checklist" className="text-[14.5px] font-semibold text-navy-900 hover:underline underline-offset-2">{String(c.deal.address || '').split(',')[0]}</button>
          <span className="rounded-md bg-[#FDECEA] text-[#B42318] px-2 py-0.5 text-[12.5px] font-semibold">⚑ {issueLabel(x.kind)}</span>
          {x.text && <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-600" title={x.text}>{x.text}</span>}
          <span className={`text-[12px] text-zinc-400 ${x.text ? '' : 'flex-1'}`} title={`${whoGets(c.deal)} were alerted`}>{x.created_by} · {when(x.created_at)}</span>
          <button type="button" onClick={() => post({ action: 'resolve', id: x.id })} className={btnCls}>✓ Resolved</button>
        </div>
      ))}
    </section>
  );
}

function AddTask({ onAdd }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => { if (!text.trim()) return; setBusy(true); const ok = await onAdd(text, due || null); setBusy(false); if (ok) { setText(''); setDue(''); } };
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Add a task for this deal…" maxLength={200}
        className="flex-1 min-w-[220px] h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-navy-100" />
      <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-500">due
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px]" />
      </label>
      <button type="button" onClick={add} disabled={busy || !text.trim()} className={primaryCls}>Add Task</button>
    </div>
  );
}

// The deal's timeline under its header.
function Timeline({ d, c, today }) {
  const em = c.steps.find((s) => s.id === 'em');
  const pts = [
    ['Contract', d.accepted ? shortDate(d.accepted) : '—', !!d.accepted && d.accepted <= today],
    ['EMD in', d.emdSent ? shortDate(d.emdSent) : em && !em.open ? 'in' : '—', !!em && !em.open],
    ['IP ends', d.ddEnd ? shortDate(d.ddEnd) : '—', !!d.ddEnd && (d.ddEnd < today || c.steps.find((s) => s.id === 'ip48')?.skip)],
    ['Assigned', c.groups.find((g) => g.id === 'assigned')?.active ? 'yes' : 'no buyer yet', !!c.groups.find((g) => g.id === 'assigned')?.active],
    ['COE', d.coe ? shortDate(d.coe) : '—', c.closed],
    ['Closed', c.closed ? shortDate(d.coe) : '—', c.closed],
  ];
  const nowAt = pts.findIndex((p) => !p[2]);
  return (
    <ol className="relative grid grid-cols-6 mt-3">
      <span className="absolute left-[8%] right-[8%] top-[10px] h-[3px] bg-tan-200" aria-hidden="true" />
      {pts.map(([l, v, ok], i) => (
        <li key={l} className="relative text-center text-[12px]">
          <span className={`mx-auto mb-1 grid place-items-center w-[22px] h-[22px] rounded-full border-[3px] text-[11px] font-extrabold ${ok ? 'bg-emerald-600 border-emerald-600 text-white' : i === nowAt ? 'bg-white border-navy-700 text-navy-700' : 'bg-white border-tan-200'}`}>{ok ? '✓' : i === nowAt ? '•' : ''}</span>
          <b className="block text-navy-900 text-[12.5px]">{l}</b><span className="text-zinc-500">{v}</span>
        </li>
      ))}
    </ol>
  );
}

const day = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric' });
const plain = (t) => String(t || '').replace(/^(done|not needed) — /, '');

// One slim line per step (Luke, Oct 28: "hard to navigate … more streamlined
// … make them all the normal color"): every step reads in navy; what state it
// is in is a small tag on the right instead of grey or struck-through text —
// ✓ Done (who / when), ✓ From the deal (ticked by itself from a deal field),
// Not needed, Not tracked (due before the step was on the list), or the due
// chip while it's open. The how-to shows only on open steps.
function StepLine({ it, d, post, today }) {
  const { ask, setAsk, saving, tick, save } = useTick(d, post);
  const undo = (item) => <button type="button" className="ml-1 underline text-zinc-500 hover:text-navy-800" onClick={() => post({ action: 'check', dealId: d.id, item, done: false })}>undo</button>;
  const tagCls = 'rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap';
  let tag = null;
  if (it.open) {
    const late = it.dueOn && it.dueOn < today;
    tag = it.dueOn ? <span className={`${tagCls} ${late ? 'bg-[#4c0519] text-white' : it.dueOn === today ? 'bg-[#B42318] text-white' : 'bg-tan-100 text-tan-800'}`}>{late ? `${shortDate(it.dueOn)} · late` : it.dueOn === today ? 'Today' : longDay(it.dueOn)}</span> : null;
  } else if (it.na) tag = <span className="text-[12px] text-zinc-500 whitespace-nowrap"><span className={`${tagCls} bg-zinc-100 text-zinc-600`}>Not needed</span> {it.na.done_by} {day(it.na.done_at)}{undo(NA(it.id))}</span>;
  else if (it.done) tag = <span className="text-[12px] text-zinc-500 whitespace-nowrap"><span className={`${tagCls} bg-emerald-50 text-emerald-700`}>✓ Done</span> {it.done.done_by} {day(it.done.done_at)}{undo(it.id)}</span>;
  else if (it.skip) tag = <span className={`${tagCls} bg-zinc-100 text-zinc-600`} title={plain(it.why)}>Not needed</span>;
  else if (it.auto) tag = <span className={`${tagCls} bg-emerald-50 text-emerald-700`} title={it.why || ''}>✓ From the deal</span>;
  else if (it.stale) tag = <span className={`${tagCls} bg-amber-50 text-amber-800`} title="Due before this step was added to the list — not counted late. Tick it if it’s done.">Not tracked</span>;
  else if (!it.active) tag = <span className={`${tagCls} bg-zinc-50 text-zinc-400`}>Later</span>;
  const sub = it.open ? it.how : it.done || it.na ? null : it.skip || it.auto ? plain(it.why) : null;
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2 border-t border-tan-100 hover:bg-tan-50/50">
      <input type="checkbox" checked={!!it.done || !!it.auto || !!it.na || !!it.skip} disabled={!it.active || !!it.auto || !!it.skip || !!it.na || saving} onChange={(e) => tick(it, e.target.checked)} aria-label={it.label}
        className="mt-[3px] w-[17px] h-[17px] accent-[#1b385f] cursor-pointer disabled:cursor-default" />
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-navy-900 leading-snug">{it.label}</div>
        {sub && <div className="text-[12.5px] text-zinc-500 truncate" title={sub}>{sub}</div>}
        {it.open && it.mail && <div className="mt-1"><CopyButton text={email48(d)} label="Copy the 48-Hour Email" /></div>}
        {ask && <div className="mt-1.5"><LinkAsk kind={ask} d={d} save={save} onDone={() => setAsk(null)} /></div>}
      </div>
      <div className="pt-0.5 flex flex-col items-end gap-0.5">
        {tag}
        {it.open && <button type="button" onClick={() => post({ action: 'check', dealId: d.id, item: NA(it.id), done: true })} className="text-[11.5px] text-zinc-400 hover:text-navy-800 hover:underline whitespace-nowrap">Not needed</button>}
      </div>
    </li>
  );
}

// The deal's checklist in the side panel.
function DealChecklist({ c, today, post, onFlag }) {
  const d = c.deal;
  // The phases with something open now (late, today, next 7 days) start open.
  const weekOut = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const hot = (g) => g.active && g.items.some((s) => s.open && s.dueOn && s.dueOn <= weekOut);
  const [open, setOpen] = useState(() => { const s = new Set(c.groups.filter(hot).map((g) => g.id)); if (!s.size) { const f = c.groups.find((g) => g.active && g.items.some((x) => x.open)); if (f) s.add(f.id); } return s; });
  const flip = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = c.total - c.left;
  // Inside the deal panel (Luke, Oct 28: "add tc checklist as a 4th tab on
  // the property address popup") — the panel's header carries the address,
  // stage and rep, so this opens with the title / escrow line, progress and Flag.
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-tan-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-700">TC Checklist</span>
          <span className="rounded-md bg-tan-50 ring-1 ring-tan-200 px-2 py-0.5 text-navy-900">{firstLine(d.title) || <span className="text-[#B42318]">no title agency</span>}{d.escrow ? ` · escrow #${d.escrow}` : ''}</span>
          <button type="button" onClick={() => onFlag(d)} className="ml-auto h-7 rounded-lg bg-tan-500 px-2.5 text-[12.5px] font-semibold text-navy-900 hover:bg-tan-400">⚑ Flag an Issue</button>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <span className="h-2 flex-1 rounded-full bg-tan-100 overflow-hidden"><span className="block h-full bg-navy-700" style={{ width: `${c.total ? Math.round((done / c.total) * 100) : 0}%` }} /></span>
          <span className="text-[12.5px] font-semibold text-navy-800 whitespace-nowrap">{done} of {c.total} done</span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-tan-200 bg-white px-4 pt-1 pb-3">
          <Timeline d={d} c={c} today={today} />
        </div>
        {c.warns.map((w) => <div key={w.warn.id} className={`rounded-xl px-4 py-2.5 text-[13.5px] ${w.warn.red ? 'bg-[#FDECEA] text-[#B42318] border border-[#F5C2BD]' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}><b>{w.warn.text}</b> · {w.warn.how}</div>)}
        {c.issues.map((x) => (
          <div key={x.id} className="rounded-xl border border-[#F5C2BD] bg-[#FDECEA] px-4 py-2.5 text-[13.5px] text-[#B42318] flex flex-wrap items-center gap-2">
            <span className="mr-auto"><b>⚑ Open issue · {issueLabel(x.kind)}</b>{x.text ? ` · “${x.text}”` : ''} · flagged by {x.created_by} {when(x.created_at)}</span>
            <button type="button" onClick={() => post({ action: 'resolve', id: x.id })} className="underline font-semibold">Mark resolved</button>
          </div>
        ))}
        <div className="flex items-center gap-3 text-[12.5px]">
          <span className="font-semibold text-navy-900">Checklist</span>
          <span className="text-zinc-500">phases with work due this week are open</span>
          <button type="button" onClick={() => setOpen(new Set(c.groups.map((g) => g.id)))} className="ml-auto font-semibold text-navy-700 hover:underline">Open All</button>
          <button type="button" onClick={() => setOpen(new Set())} className="font-semibold text-navy-700 hover:underline">Fold All</button>
        </div>
        {c.groups.map((g, i) => {
          const n = g.items.filter((s) => s.active && !s.open && !s.stale).length;
          const m = g.items.filter((s) => s.active).length;
          const late = g.items.filter((s) => s.open && s.dueOn && s.dueOn < today).length;
          const isOpen = open.has(g.id);
          const state = !g.active ? g.wait : n === m ? '✓ Done' : `${n} of ${m}`;
          return (
            <section key={g.id} className="rounded-xl border border-tan-200 bg-white overflow-hidden">
              <button type="button" onClick={() => flip(g.id)} aria-expanded={isOpen} className={`w-full flex items-center gap-2.5 px-4 py-2 text-left ${PANEL_HEAD}`}>
                <span className={`text-white/70 text-[12px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="grid place-items-center w-5 h-5 rounded bg-white/15 text-[11.5px] font-bold">{i + 1}</span>
                <span className="text-[14px] font-semibold">{g.label}</span>
                <span className="text-[12px] text-white/60 truncate">{g.span}</span>
                {late > 0 && <span className="rounded-md bg-[#4c0519] px-1.5 py-0.5 text-[11.5px] font-semibold">{late} late</span>}
                <span className={`ml-auto rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${n === m && g.active ? 'bg-emerald-600 text-white' : 'bg-tan-500 text-navy-900'}`}>{state}</span>
              </button>
              {isOpen && <ul>{g.items.map((it) => <StepLine key={it.id} it={it} d={d} post={post} today={today} />)}</ul>}
            </section>
          );
        })}
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-navy-700 text-white text-[14px] font-semibold">Tasks for This Deal</div>
          {c.tasks.length === 0 && <div className="px-4 py-2.5 text-[12.5px] text-zinc-400">No extra tasks yet.</div>}
          <ul>
            {c.tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-2.5 border-t border-tan-100 text-[13.5px]">
                <input type="checkbox" checked={!!t.done_at} onChange={(e) => post({ action: 'task', id: t.id, done: e.target.checked })} aria-label={t.text} className="mt-0.5 w-[18px] h-[18px] accent-[#1b385f]" />
                <span className="min-w-0 flex-1">
                  <span className={t.done_at ? 'text-zinc-400 line-through' : 'text-navy-900 font-semibold'}>{t.text}</span>
                  <span className="block text-[12px] text-zinc-500">{t.due ? `due ${shortDate(t.due)} · ` : ''}added by {t.created_by} {when(t.created_at)}{t.done_at ? ` · done by ${t.done_by} ${when(t.done_at)}` : ''}</span>
                </span>
                <button type="button" onClick={() => { if (window.confirm(`Delete the task “${t.text}”?`)) post({ action: 'remove', id: t.id }); }} className="text-[12px] text-zinc-400 hover:text-red-700" aria-label="Delete task">✕</button>
              </li>
            ))}
          </ul>
          <AddTask onAdd={(text, due) => post({ action: 'add', dealId: d.id, text, due })} />
        </section>
      </div>
    </div>
  );
}

// The deal panel's TC Checklist tab (owners and the TC): the deal's checklist,
// warnings, open issues and tasks, from the same store as the TC List page.
export function DealTcTab({ id }) {
  const s = useDeals();
  const { st, err, post } = useTc();
  const [flagging, setFlagging] = useState(null);
  const today = laToday();
  const d = s.deals.find((x) => x.id === id);
  const c = useMemo(() => (st && d ? buildTcCards([d], st, today)[0] || null : null), [st, d, today]);
  if (!st) return <div className="py-16 text-center text-zinc-400">Loading the checklist…</div>;
  if (!c) return <div className="rounded-xl border border-tan-200 bg-white px-4 py-6 text-center text-[13.5px] text-zinc-500">This deal isn’t on the TC List — it’s cancelled, or closed before October.</div>;
  return (
    <>
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <DealChecklist c={c} today={today} post={post} onFlag={setFlagging} />
      {flagging && <FlagDialog d={flagging} post={post} onClose={() => setFlagging(null)} />}
    </>
  );
}

// The checklist itself, at the foot of the page (Luke, Oct 26: removed steps
// "grey them out so i can reference what was mentioned vs. what i've removed").
function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6 rounded-xl border border-tan-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold text-navy-900 hover:bg-tan-50">
        ⓘ The Checklist — {CHECKLIST.reduce((n, g) => n + g.items.length, 0)} steps from contract to closed, and what was removed
        <span className={`ml-auto text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 text-[13px]">
          {CHECKLIST.map((g, i) => (
            <div key={g.id}>
              <div className="font-semibold text-navy-900">{i + 1} · {g.label} <span className="font-normal text-zinc-500">· {g.span}</span></div>
              <ul className="mt-1 list-disc pl-5 text-zinc-700">{g.items.map((it) => <li key={it.id}>{it.label}{it.auto ? <span className="text-emerald-700"> · ticks itself</span> : ''}</li>)}</ul>
            </div>
          ))}
          <div>
            <div className="font-semibold text-zinc-500">Removed (Oct 26)</div>
            <ul className="mt-1 list-disc pl-5 text-zinc-400">{REMOVED.map(([l, why]) => <li key={l}><span className="line-through">{l}</span> · <i>{why}</i></li>)}</ul>
          </div>
          <p className="md:col-span-2 xl:col-span-3 text-[12.5px] text-zinc-500">The site also raises warnings on its own: IP ends within 24 / 48 hours with no buyer, EMD due tomorrow and not sent, COE within 7 days and no buyer, COE passed while the deal is still open. A closed deal leaves the list by itself once its last steps are done.</p>
        </div>
      )}
    </section>
  );
}

export default function TcListView() {
  const s = useDeals();
  const { open: openDeal, panel } = useDealPanel();
  const { st, err, post } = useTc();
  const [flagging, setFlagging] = useState(null);
  const [q, setQ] = useState('');
  const [fold, setFold] = useState(readFold);
  const { query } = useLocation();
  const asked = query.get('view');
  // Old Closing This Week / Open Issues links land on All Deals filtered to it.
  const old = asked === 'closing' || asked === 'issues' ? asked : null;
  const view = old ? 'all' : VIEWS.has(asked) ? asked : 'day';
  const filter = old || (FILTERS[query.get('f')] ? query.get('f') : null);
  const cardId = query.get('card');
  const today = laToday();
  const all = useMemo(() => (st ? buildTcCards(s.deals, st, today) : []), [s.deals, st, today]);
  // Older ?card= links (Alerts, bookmarks) open the deal on its TC Checklist tab.
  useEffect(() => { if (cardId) setQuery({ card: null, deal: cardId, tab: 'tc' }); }, [cardId]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  if (!st) return <div className="py-16 text-center text-zinc-400">Loading the TC list…</div>;
  const needle = q.trim().toLowerCase();
  const hit = (c) => !needle || [c.deal.address, c.deal.escrow, c.deal.acq, c.deal.dispoMember, firstLine(c.deal.title)].some((x) => String(x || '').toLowerCase().includes(needle));
  const cards = all.filter((c) => !c.out && hit(c));
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  // My Day (Luke, Oct 28: "just things that are late, due today, or due
  // tomorrow"): every property with one of those; its items in due order.
  const ORDER = { late: 0, today: 1, soon: 2 };
  const day = cards.map((c) => ({ c, rows: [...c.late, ...c.today, ...c.soon.filter((r) => r.dueOn === tomorrow)].sort((a, b) => (a.warn ? -1 : 0) - (b.warn ? -1 : 0) || ORDER[a.bucket] - ORDER[b.bucket] || String(a.dueOn).localeCompare(String(b.dueOn))) }))
    .filter((x) => x.rows.length);
  const now = day.filter((x) => x.rows.some((r) => r.bucket !== 'soon'));
  const next = day.filter((x) => x.rows.every((r) => r.bucket === 'soon'));
  // Both groups keep the cards' COE order (soonest closing first).
  const weekOut = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const isClosing = (c) => !c.closed && c.deal.coe && c.deal.coe >= today && c.deal.coe <= weekOut;
  const isUrgent = (c) => c.late.length > 0 || c.today.length > 0;
  const urgent = cards.filter(isUrgent);
  const closing = cards.filter(isClosing);
  const shown = filter === 'urgent' ? urgent : filter === 'closing' ? closing : filter === 'issues' ? cards.filter((c) => c.issues.length) : cards;
  const issues = cards.reduce((n, c) => n + c.issues.length, 0);
  const actNow = s.deals.filter((d) => isOpen(d) && urgency(d, today).sec === 'act').length;
  const go = (v) => setQuery({ view: v === 'day' ? null : v, f: null });
  const pickFilter = (f) => setQuery({ view: 'all', f: view === 'all' && filter === f ? null : f });
  // A property opens the deal panel on its TC Checklist tab (Luke, Oct 28).
  const onCard = (id) => openDeal(id, null, 'tc');
  const toggle = (id) => setFold((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); saveFold(n); return n; });
  const foldAll = (shut) => setFold(() => { const n = shut ? new Set(day.map((x) => x.c.deal.id)) : new Set(); saveFold(n); return n; });
  const rowProps = { today, post, onCard, onDeal: openDeal, onFlag: setFlagging };
  const dayCard = (x) => <DayCard key={x.c.deal.id} c={x.c} rows={x.rows} {...rowProps} folded={fold.has(x.c.deal.id)} onFold={() => toggle(x.c.deal.id)} />;
  const groups = [
    { items: [{ id: 'all', label: 'Deal Overview', sub: 'Where each one stands', count: cards.length }], title: 'Deals' },
    { items: [{ id: 'day', label: 'My Day', sub: 'Late, today and tomorrow', count: day.length, tone: now.length ? 'red' : 'navy' }], title: 'Work' },
  ];
  const listCount = view === 'day' ? day.length : filter === 'issues' ? issues : shown.length;
  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="TC List" sub={`${longDay(today)} · what needs doing on every deal, property by property`}
        right={<CrossLink to="/deals/active?only=act" label="Active Deals" n={actNow} word="act now" title="The owners' view of deal problems — past deadlines, EMD, IP ending with no buyer" />}
        counters={<>
          <BandCounter label="Urgent" sub="late or due today" value={urgent.length} warn filter active={view === 'all' && filter === 'urgent'} onClick={() => pickFilter('urgent')} title="Deal Overview: deals with something late or due today" />
          <BandCounter label="Closing this week" value={closing.length} filter active={view === 'all' && filter === 'closing'} onClick={() => pickFilter('closing')} title="Deal Overview: deals with a COE in the next 7 days" />
          <BandCounter label="Open issues" value={issues} warn filter active={view === 'all' && filter === 'issues'} onClick={() => pickFilter('issues')} title="Deal Overview: deals with a flagged issue" />
        </>} />
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <div className={RAIL_GRID}>
        <SideRail label="TC List sections" groups={groups} value={view} onPick={go} />
        <div className="min-w-0 flex flex-col gap-4">
          {/* The search sits at the head of the list it searches (Luke, Oct 28). */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search properties — address, escrow #, rep, title" className="w-full sm:w-[380px]" />
            {view === 'all' && filter && <button type="button" onClick={() => setQuery({ f: null })} className="inline-flex items-center gap-1.5 h-8 rounded-md bg-navy-700 px-2.5 text-[12.5px] font-semibold text-white hover:bg-navy-800">{FILTERS[filter]} <span className="text-white/70">×</span></button>}
            <span className="text-[12.5px] text-zinc-500">{listCount} {filter === 'issues' ? (listCount === 1 ? 'issue' : 'issues') : listCount === 1 ? 'property' : 'properties'}{needle ? ` matching “${q.trim()}”` : ''}</span>
            {view === 'day' && day.length > 0 && <span className="ml-auto flex gap-2"><button type="button" onClick={() => foldAll(true)} className={btnCls}>Fold All</button><button type="button" onClick={() => foldAll(false)} className={btnCls}>Open All</button></span>}
          </div>
          {view === 'day' && (day.length ? <>
            {now.length > 0 && <section className="flex flex-col gap-2.5"><DayHead label="Late & Due Today" n={now.length} />{now.map(dayCard)}</section>}
            {next.length > 0 && <section className="flex flex-col gap-2.5"><DayHead label="Due Tomorrow" n={next.length} />{next.map(dayCard)}</section>}
          </> : <Empty>✓ Nothing late, due today or due tomorrow</Empty>)}
          {view === 'all' && (filter === 'issues' ? <IssuesView cards={cards} post={post} onCard={onCard} /> : <DealTable cards={shown} today={today} onCard={onCard} />)}
          <HowItWorks />
        </div>
      </div>
      {flagging && <FlagDialog d={flagging} post={post} onClose={() => setFlagging(null)} />}
      {panel}
    </div>
  );
}
