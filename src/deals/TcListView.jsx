// Deals › TC List — the "TC Desk" (Luke, Oct 26, from the approved mock-up
// round 2: "a best in class property tracking layout for a professional
// transaction coordinator that allows them to easily track, update, alert, and
// check off needed items"; then "keep the style that we have throughout the
// site. keep left tabs … the action item is hard to see — increase this and
// make sure it is clear what must be done").
//
// The navy band (Overdue / Today / Next 3 days / Open issues counters, search)
// and the site's left rail: My Day (late + today, the default), Next 3 Days,
// Closing This Week, Open Issues, All Deals, Closed Out, Monday Updates. A row
// = one step on one deal: the address, the rep · sub-account box and stage,
// then a tan "To do" box with the step in large type, how to do it, and the
// due box; Checklist / Flag an Issue / Mark Done. All Deals is one line per
// deal with "Where It Stands" and a dot per milestone. A row's Checklist (or
// a table row) opens the deal's checklist in a side panel (`?card=`): its
// timeline, open issues, the five phases with every step (tick / Not needed),
// tasks for the deal. The steps themselves live in tcList.js (CHECKLIST).
// D1 via /api/tc (ticks, tasks, issues — Flag an Issue alerts the owners and
// the deal's acq rep and dispo rep). Deals open in the deal panel.
import { useEffect, useMemo, useState } from 'react';
import { useDeals, saveDeal } from './store.js';
import { call } from '../utils/dashApi.js';
import { buildTcCards, CHECKLIST, REMOVED, MILESTONES, ISSUE_KINDS, issueLabel, statusUpdate, email48, standing, whenWord, milestone, mondayOf, isMonday, vpgPlacedEm, firstLine, NA } from './tcList.js';
import { Loading, StatusChip, CoeChip, PageHead, Search } from './ui.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';
import RepTag from '../shell/RepTag.jsx';
import { dealTag } from './urgency.js';
import { personColor } from './personColor.js';
import { shortDate, primaryCls, btnCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';
import { useMe } from '../utils/dashApi.js';

const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const up = (x) => String(x ?? '').trim().toUpperCase();
const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
// "the owners, Sam and Cayden" — who a flagged issue alerts.
const whoGets = (d) => { const p = [...new Set([d.acq, d.dispoMember].filter(Boolean))]; return p.length ? `the owners, ${p.join(' and ')}` : 'the owners'; };
const VIEWS = new Set(['day', 'soon', 'closing', 'issues', 'all', 'out', 'monday']);

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

function useTc() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { call('tc').then(setSt).catch((e) => { setErr(e.message); setSt({ checks: [], tasks: [], issues: [], assigned: {} }); }); }, []);
  const post = async (body) => {
    setErr(null);
    try { setSt(await call('tc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); return true; } catch (e) { setErr(e.message); return false; }
  };
  return { st, err, post };
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

const DUE_BOX = { late: 'bg-[#4c0519] text-white', today: 'bg-[#B42318] text-white', soon: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', later: 'bg-tan-100 text-tan-800' };
const EDGE = { late: 'border-l-[#B42318]', today: 'border-l-amber-500', soon: 'border-l-sky-600', later: 'border-l-tan-300' };

// One thing to do on one deal (a step, a task or a warning).
function TaskRow({ r, today, post, onCard, onDeal, onFlag }) {
  const d = r.deal;
  const { ask, setAsk, saving, tick, save } = useTick(d, post);
  const [busy, setBusy] = useState(false);
  const tag = dealTag(d);
  const title = r.warn ? r.warn.text : r.step ? r.step.label : r.task.text;
  const how = r.warn ? r.warn.how : r.step ? r.step.how : `Task added by ${r.task.created_by}${r.task.due ? '' : ' (no due date)'}`;
  const box = r.warn ? (r.warn.red ? 'late' : 'today') : r.bucket;
  const boxTop = r.warn ? 'Now' : r.bucket === 'late' ? `${r.lateBy} day${r.lateBy === 1 ? '' : 's'}` : r.dueOn === today ? 'Today' : whenWord(r, today);
  const boxSub = r.warn ? r.warn.chip : r.bucket === 'late' ? 'late' : r.dueOn === today ? longDay(today) : r.bucket === 'soon' ? 'coming up' : '';
  const done = async () => {
    setBusy(true);
    try { if (r.task) await post({ action: 'task', id: r.task.id, done: true }); else await tick(r.step, true); } finally { setBusy(false); }
  };
  return (
    <div className={`rounded-xl border border-tan-200 border-l-[5px] ${EDGE[box]} bg-white px-4 py-3 flex flex-col gap-2.5 shadow-[0_1px_2px_rgba(27,56,95,0.04)]`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onDeal(d.id)} title="Open the deal" className="mr-auto text-left text-[15px] font-semibold text-navy-900 hover:underline underline-offset-2">{d.address}</button>
        {tag && <RepTag label={tag.label} color={tag.color} />}
        <StatusChip status={d.status} />
        {r.task && <span className="rounded-md bg-sky-50 text-sky-800 ring-1 ring-sky-200 px-1.5 text-[11.5px] font-semibold">Task</span>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center rounded-lg bg-tan-100/70 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-tan-800">To do</div>
          <div className="text-[18px] font-semibold leading-snug text-navy-900 [text-wrap:balance]">{title}</div>
          <div className="text-[13.5px] text-zinc-700 mt-0.5">{how}</div>
        </div>
        <div className={`rounded-lg px-3 py-2 min-w-[104px] text-center ${DUE_BOX[box]}`}>
          <div className="text-[16px] font-bold leading-tight">{boxTop}</div>
          {boxSub && <div className="text-[11.5px] font-semibold opacity-90">{boxSub}</div>}
        </div>
      </div>
      {ask && <LinkAsk kind={ask} d={d} save={save} onDone={() => setAsk(null)} />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {r.step && !r.step.auto && <button type="button" onClick={() => post({ action: 'check', dealId: d.id, item: NA(r.step.id), done: true })} className="mr-auto text-[12.5px] text-zinc-500 hover:text-navy-800 hover:underline">Not needed on this deal</button>}
        {r.step?.mail && <CopyButton text={email48(d)} label="Copy the Email" />}
        <button type="button" onClick={() => onCard(d.id)} className={btnCls}>Checklist</button>
        <button type="button" onClick={() => onFlag(d)} className={`${btnCls} !text-[#B42318] !border-[#F5C2BD]`}>⚑ Flag an Issue</button>
        {r.warn ? <button type="button" onClick={() => onDeal(d.id)} className={`${primaryCls} !h-9 !px-4 !text-[14px]`}>Open Deal</button>
          : <button type="button" disabled={busy || saving} onClick={done} className={`${primaryCls} !h-9 !px-4 !text-[14px]`}>{busy || saving ? 'Saving…' : '✓ Mark Done'}</button>}
      </div>
    </div>
  );
}

function Group({ label, tone, rows, ...p }) {
  if (!rows.length) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={`flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] ${tone}`}>{label}<span className="rounded-full border-[1.5px] border-current px-2 text-[11px] tabular-nums">{rows.length}</span></h3>
      {rows.map((r) => <TaskRow key={`${r.deal.id}:${r.step?.id || r.task?.id || r.warn?.id}`} r={r} {...p} />)}
    </section>
  );
}

function Empty({ children }) {
  return <div className="rounded-xl border border-tan-200 bg-white px-5 py-12 text-center text-[15px] font-medium text-[#15803D]">{children}</div>;
}

// The Monday row on My Day (Luke, Oct 26: "yes keep it").
function MondayRow({ n, onOpen }) {
  return (
    <div className="rounded-xl border border-tan-200 border-l-[5px] border-l-amber-500 bg-white px-4 py-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-[15px] font-semibold text-navy-900">Monday status updates · {n} deal{n === 1 ? '' : 's'}</span><span className="rounded-md bg-sky-50 text-sky-800 ring-1 ring-sky-200 px-1.5 text-[11.5px] font-semibold">Every Monday</span></div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-center rounded-lg bg-tan-100/70 px-3.5 py-2.5">
        <div><div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-tan-800">To do</div><div className="text-[18px] font-semibold text-navy-900">Send this week’s status update for each open deal</div><div className="text-[13.5px] text-zinc-700 mt-0.5">Each one is written for you. Copy it into your email to title, the listing agent and (once assigned) the buyer, then Mark Sent.</div></div>
        <div className="rounded-lg px-3 py-2 min-w-[104px] text-center bg-[#B42318] text-white"><div className="text-[16px] font-bold">Today</div><div className="text-[11.5px] font-semibold">by noon</div></div>
      </div>
      <div className="flex justify-end"><button type="button" onClick={onOpen} className={`${primaryCls} !h-9 !px-4 !text-[14px]`}>Open the {n} Update{n === 1 ? '' : 's'}</button></div>
    </div>
  );
}

function MondayView({ cards, today, post, name }) {
  const monday = mondayOf(today);
  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-xl border border-tan-200 bg-white px-4 py-3 text-[13.5px] text-zinc-700">
        Week of <b className="text-navy-800">{longDay(monday)}</b>. One message per open deal, written from the deal sheet and the checklist — read it over, <b>Copy</b>, paste it into your email to title, the listing agent and (once assigned) the buyer, then <b>Mark Sent</b>. Nothing is sent by the site.
      </div>
      {cards.map((c) => (
        <article key={c.deal.id} className={`rounded-xl border bg-white overflow-hidden ${c.monSent ? 'border-emerald-200' : 'border-tan-200'}`}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-navy-700 text-white">
            <span className="font-semibold mr-auto">{c.deal.address}</span>
            {c.monSent && <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-[12px] font-semibold">✓ Sent · {c.monSent.done_by} {when(c.monSent.done_at)}</span>}
          </div>
          <pre className="px-4 py-3 whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-zinc-800">{statusUpdate(c, today, name)}</pre>
          <div className="flex justify-end gap-2 px-4 py-2.5 border-t border-tan-100 bg-tan-50">
            <CopyButton text={statusUpdate(c, today, name)} big />
            <button type="button" onClick={() => post({ action: 'check', dealId: c.deal.id, item: `mon:${monday}`, done: !c.monSent })} className={btnCls}>{c.monSent ? 'Undo Sent' : 'Mark Sent'}</button>
          </div>
        </article>
      ))}
    </section>
  );
}

// All Deals: one line per deal, where it stands, a dot per milestone.
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

function IssuesView({ cards, post, onCard }) {
  const list = cards.flatMap((c) => c.issues.map((x) => ({ c, x })));
  if (!list.length) return <Empty>✓ No open issues</Empty>;
  return (
    <section className="flex flex-col gap-2.5">
      {list.map(({ c, x }) => (
        <div key={x.id} className="rounded-xl border border-[#F5C2BD] bg-[#FDF4F3] px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="min-w-0 mr-auto">
            <div className="text-[15px] font-semibold text-navy-900">{c.deal.address}</div>
            <div className="text-[16px] font-semibold text-[#B42318]">⚑ {issueLabel(x.kind)}</div>
            {x.text && <div className="text-[13.5px] text-zinc-700">{x.text}</div>}
            <div className="text-[12px] text-zinc-500">Flagged by {x.created_by} · {when(x.created_at)} · {whoGets(c.deal)} were alerted</div>
          </div>
          <button type="button" onClick={() => onCard(c.deal.id)} className={btnCls}>Checklist</button>
          <button type="button" onClick={() => post({ action: 'resolve', id: x.id })} className={primaryCls}>Mark Resolved</button>
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

function StepLine({ it, d, post, today }) {
  const { ask, setAsk, saving, tick, save } = useTick(d, post);
  const dueCls = !it.open ? '' : it.dueOn && it.dueOn < today ? 'bg-[#4c0519] text-white' : it.dueOn === today ? 'bg-[#B42318] text-white' : 'bg-tan-100 text-tan-800';
  return (
    <li className={`grid grid-cols-[22px_minmax(0,1fr)_auto] gap-3 px-4 py-2.5 border-t border-tan-100 ${it.active ? '' : 'opacity-50'}`}>
      <input type="checkbox" checked={!!it.done || !!it.auto || !!it.na || !!it.skip} disabled={!it.active || !!it.auto || !!it.skip || !!it.na || saving} onChange={(e) => tick(it, e.target.checked)} aria-label={it.label}
        className="mt-0.5 w-[18px] h-[18px] accent-[#1b385f] cursor-pointer disabled:cursor-default" />
      <div className="min-w-0">
        <div className={`text-[14px] font-semibold ${it.open || !it.active ? 'text-navy-900' : it.stale ? 'text-zinc-500' : 'text-zinc-400 line-through decoration-tan-300'}`}>{it.label}</div>
        <div className="text-[12.5px] text-zinc-500">
          {it.na ? <>Not needed · {it.na.done_by} {when(it.na.done_at)} · <button type="button" className="underline hover:text-navy-800" onClick={() => post({ action: 'check', dealId: d.id, item: NA(it.id), done: false })}>undo</button></>
            : it.why ? it.why
              : it.done ? <>{it.done.done_by} · {when(it.done.done_at)} · <button type="button" className="underline hover:text-navy-800" onClick={() => post({ action: 'check', dealId: d.id, item: it.id, done: false })}>undo</button></>
                : it.active ? it.how : ''}
        </div>
        {it.open && it.mail && <div className="mt-1.5"><CopyButton text={email48(d)} label="Copy the 48-Hour Email" /></div>}
        {it.open && <button type="button" onClick={() => post({ action: 'check', dealId: d.id, item: NA(it.id), done: true })} className="mt-1 text-[12px] text-zinc-400 hover:text-navy-800 hover:underline">Not needed on this deal</button>}
        {ask && <div className="mt-1.5"><LinkAsk kind={ask} d={d} save={save} onDone={() => setAsk(null)} /></div>}
      </div>
      <span className={`self-start rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${dueCls}`}>{it.open && it.dueOn ? (it.dueOn < today ? `${shortDate(it.dueOn)} · late` : it.dueOn === today ? 'Today' : longDay(it.dueOn)) : ''}</span>
    </li>
  );
}

// The deal's checklist in the side panel.
function DealChecklist({ c, today, post, onDeal, onFlag, onClose, name }) {
  const d = c.deal;
  const tag = dealTag(d);
  // The phases with something open now (late, today, next 7 days) start open.
  const weekOut = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const hot = (g) => g.active && g.items.some((s) => s.open && s.dueOn && s.dueOn <= weekOut);
  const [open, setOpen] = useState(() => { const s = new Set(c.groups.filter(hot).map((g) => g.id)); if (!s.size) { const f = c.groups.find((g) => g.active && g.items.some((x) => x.open)); if (f) s.add(f.id); } return s; });
  const flip = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = c.total - c.left;
  return (
    <div className="flex flex-col">
      <div className="bg-navy-700 text-white px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 mr-auto">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">Deal Checklist</div>
            <button type="button" onClick={() => onDeal(d.id)} className="text-left text-[20px] font-semibold leading-tight hover:underline underline-offset-2">{d.address}</button>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white text-2xl leading-none px-1">×</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
          {tag && <RepTag label={tag.label} color={tag.color} />}
          <StatusChip status={d.status} />
          <span className="rounded-md bg-white/10 px-2 py-0.5">{firstLine(d.title) || <span className="text-rose-200">no title agency</span>}{d.escrow ? ` · escrow #${d.escrow}` : ''}</span>
          <span className="rounded-md bg-tan-500 text-navy-900 font-semibold px-2 py-0.5">{done} of {c.total} done</span>
        </div>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3 bg-tan-50/60">
        <div className="rounded-xl border border-tan-200 bg-white px-4 py-3">
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={() => onDeal(d.id)} className={btnCls}>Open Full Deal</button>
            <CopyButton text={statusUpdate(c, today, name)} label="Copy Status Update" />
            <button type="button" onClick={() => onFlag(d)} className={`${btnCls} !text-[#B42318] !border-[#F5C2BD]`}>⚑ Flag an Issue</button>
          </div>
          <Timeline d={d} c={c} today={today} />
        </div>
        {c.warns.map((w) => <div key={w.warn.id} className={`rounded-xl px-4 py-2.5 text-[13.5px] ${w.warn.red ? 'bg-[#FDECEA] text-[#B42318] border border-[#F5C2BD]' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}><b>{w.warn.text}</b> · {w.warn.how}</div>)}
        {c.issues.map((x) => (
          <div key={x.id} className="rounded-xl border border-[#F5C2BD] bg-[#FDECEA] px-4 py-2.5 text-[13.5px] text-[#B42318] flex flex-wrap items-center gap-2">
            <span className="mr-auto"><b>⚑ Open issue · {issueLabel(x.kind)}</b>{x.text ? ` · “${x.text}”` : ''} · flagged by {x.created_by} {when(x.created_at)}</span>
            <button type="button" onClick={() => post({ action: 'resolve', id: x.id })} className="underline font-semibold">Mark resolved</button>
          </div>
        ))}
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
          {c.groups.map((g, i) => {
            const n = g.items.filter((s) => s.active && !s.open).length;
            const m = g.items.filter((s) => s.active).length;
            const isOpen = open.has(g.id);
            return (
              <div key={g.id} className={i ? 'border-t border-tan-200' : ''}>
                <button type="button" onClick={() => flip(g.id)} aria-expanded={isOpen} className="w-full flex items-center gap-2 px-4 py-2.5 bg-tan-100/70 text-left hover:bg-tan-100">
                  <span className="grid place-items-center w-6 h-6 rounded-md bg-navy-700 text-white text-[12px] font-bold">{i + 1}</span>
                  <span className={`text-[14px] font-semibold ${g.active ? 'text-navy-900' : 'text-zinc-500'}`}>{g.label}</span>
                  <span className="ml-auto text-[12px] text-tan-800">{!g.active ? g.wait : n === m ? '✓ done' : `${n} of ${m}`} · {g.span}</span>
                  <span className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {isOpen && <ul>{g.items.map((it) => <StepLine key={it.id} it={it} d={d} post={post} today={today} />)}</ul>}
              </div>
            );
          })}
        </section>
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
  const me = useMe();
  const { open: openDeal, panel } = useDealPanel();
  const { st, err, post } = useTc();
  const [flagging, setFlagging] = useState(null);
  const [q, setQ] = useState('');
  const { query } = useLocation();
  const asked = query.get('view');
  const view = VIEWS.has(asked) ? asked : 'day';
  const cardId = query.get('card');
  const dealOpen = !!query.get('deal');
  const today = laToday();
  const all = useMemo(() => (st ? buildTcCards(s.deals, st, today) : []), [s.deals, st, today]);
  useEffect(() => {
    if (!cardId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !dealOpen && !flagging) setQuery({ card: null }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cardId, dealOpen, flagging]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  if (!st) return <div className="py-16 text-center text-zinc-400">Loading the TC list…</div>;
  const name = String(me?.realName || me?.name || 'Aiza').split(' ')[0];
  const needle = q.trim().toLowerCase();
  const hit = (c) => !needle || [c.deal.address, c.deal.escrow, c.deal.acq, c.deal.dispoMember, firstLine(c.deal.title)].some((x) => String(x || '').toLowerCase().includes(needle));
  const cards = all.filter((c) => !c.out && hit(c));
  const outCards = all.filter((c) => c.out && hit(c));
  const late = cards.flatMap((c) => c.late);
  const todays = cards.flatMap((c) => c.today);
  const soon = cards.flatMap((c) => c.soon).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const closing = cards.filter((c) => !c.closed && c.deal.coe && c.deal.coe >= today && c.deal.coe <= new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10));
  const issues = cards.reduce((n, c) => n + c.issues.length, 0);
  const openDeals = cards.filter((c) => !c.closed);
  const monLeft = openDeals.filter((c) => !c.monSent).length;
  const go = (v) => setQuery({ view: v === 'day' ? null : v, card: null });
  const onCard = (id) => setQuery({ card: id });
  const card = cardId ? all.find((c) => c.deal.id === cardId) : null;
  const rowProps = { today, post, onCard, onDeal: openDeal, onFlag: setFlagging };
  const groups = [
    { items: [
      { id: 'day', label: 'My Day', sub: 'Overdue and due today', count: late.length + todays.length, tone: late.length ? 'red' : 'navy' },
      { id: 'soon', label: 'Next 3 Days', sub: 'Coming up', count: soon.length },
      { id: 'monday', label: 'Monday Updates', sub: isMonday(today) ? 'To send today' : 'Status update per deal', count: isMonday(today) ? monLeft : null },
    ], title: 'Work' },
    { items: [
      { id: 'closing', label: 'Closing This Week', sub: 'COE in 7 days', count: closing.length },
      { id: 'issues', label: 'Open Issues', sub: 'Flagged problems', count: issues, tone: issues ? 'red' : 'navy' },
    ], title: 'Watch' },
    { items: [
      { id: 'all', label: 'All Deals', sub: 'Where each one stands', count: cards.length },
      { id: 'out', label: 'Closed Out', sub: 'Every step done', count: outCards.length },
    ], title: 'Deals' },
  ];
  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="TC List" sub={`${longDay(today)} · every step for every deal, in order of when it’s due`} right={<Search dark value={q} onChange={setQ} placeholder="Search an address, escrow #, rep…" />}
        counters={<>
          <BandCounter label="Overdue" value={late.length} warn active={false} onClick={() => go('day')} />
          <BandCounter label="Today" value={todays.length} active={view === 'day'} onClick={() => go('day')} />
          <BandCounter label="Next 3 days" value={soon.length} active={view === 'soon'} onClick={() => go('soon')} />
          <BandCounter label="Open issues" value={issues} warn active={view === 'issues'} onClick={() => go('issues')} />
        </>} />
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <div className={RAIL_GRID}>
        <SideRail label="TC List sections" groups={groups} value={view} onPick={go} />
        <div className="min-w-0 flex flex-col gap-5">
          {view === 'day' && (late.length || todays.length || (isMonday(today) && monLeft)) ? <>
            <Group label="Overdue" tone="text-[#B42318]" rows={late} {...rowProps} />
            <section className="flex flex-col gap-2.5">
              {(todays.length > 0 || (isMonday(today) && monLeft > 0)) && <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-amber-700">Today<span className="rounded-full border-[1.5px] border-current px-2 text-[11px] tabular-nums">{todays.length + (isMonday(today) && monLeft ? 1 : 0)}</span></h3>}
              {isMonday(today) && monLeft > 0 && <MondayRow n={monLeft} onOpen={() => go('monday')} />}
              {todays.map((r) => <TaskRow key={`${r.deal.id}:${r.step?.id || r.task?.id || r.warn?.id}`} r={r} {...rowProps} />)}
            </section>
          </> : view === 'day' && <Empty>✓ Nothing overdue or due today{soon.length ? ` — ${soon.length} coming up in the next 3 days` : ''}</Empty>}
          {view === 'soon' && (soon.length ? <Group label="Next 3 Days" tone="text-sky-700" rows={soon} {...rowProps} /> : <Empty>✓ Nothing due in the next 3 days</Empty>)}
          {view === 'closing' && <DealTable cards={closing} today={today} onCard={onCard} />}
          {view === 'issues' && <IssuesView cards={cards} post={post} onCard={onCard} />}
          {view === 'all' && <DealTable cards={cards} today={today} onCard={onCard} />}
          {view === 'out' && <DealTable cards={outCards} today={today} onCard={onCard} />}
          {view === 'monday' && (openDeals.length ? <MondayView cards={openDeals} today={today} post={post} name={name} /> : <Empty>No open deals</Empty>)}
          <HowItWorks />
        </div>
      </div>
      {card && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-navy-900/30" onClick={() => setQuery({ card: null })} />
          <div className="relative w-full max-w-[880px] h-full bg-white shadow-2xl overflow-y-auto" role="dialog" aria-label={card.deal.address}>
            <DealChecklist key={card.deal.id} c={card} today={today} post={post} onDeal={openDeal} onFlag={setFlagging} onClose={() => setQuery({ card: null })} name={name} />
          </div>
        </div>
      )}
      {flagging && <FlagDialog d={flagging} post={post} onClose={() => setFlagging(null)} />}
      {panel}
    </div>
  );
}
