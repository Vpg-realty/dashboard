// Settings › Commission rules (owners): the rates and names the deal
// tracker's commission columns use (D1 settings.deal_rules — never in the
// public repo). Each rule has its own start date (Luke, Oct 14: "have each
// rule editable so then when we edit it also has us enter a date for when
// this will take effect … the start date referenced in there as well"):
// Edit on a rule asks for the new value and "Takes effect on", and saves just
// that change (POST /api/settings/deal-rules { change }). A deal uses, rule by
// rule, what was in effect on its COE (src/deals/rules.js, math.js
// pickRules), so closed deals keep the rules they had. Every rule shows its
// value today, since when, any change still to come and its own history.
// Before saving, shows which deals the change moves.
import { useEffect, useMemo, useState } from 'react';
import { readSetting, changeRule } from '../utils/dashApi.js';
import { useDeals, loadDeals } from '../deals/store.js';
import { compute, RULE_STATUSES } from '../deals/math.js';
import { toTimelines, entryAt, applyChange, TRACKER_START, rulesAt } from '../deals/rules.js';
import { laToday } from '../utils/historyRange.js';
import { money } from '../deals/format.js';
import { Section, Field, Pct, Money, inputCls } from './ui.jsx';

const signed = (x) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x))}`;
const STATUSES = RULE_STATUSES;
const n = (x) => (typeof x === 'number' ? x : 0);
const total = (d) => n(d.acqComm) + n(d.dispoComm) + n(d.mgrComm) + n(d.override) + n(d.tcComm);
const NET = 'acqOfNet:';
const day = (iso, year = true) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const sinceText = (iso) => (iso === TRACKER_START ? 'since the tracker began' : `since ${day(iso)}`);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

// Every rule on the page, by section. type decides the editor and the text.
const SECTIONS = [
  { title: 'Acquisition and dispo', sub: 'Commission base = net assignment − TC fee.', rules: [
    { key: 'acqRate', label: 'Acquisition manager', hint: 'of the commission base', type: 'pct' },
    { key: 'dispoRate', label: 'Dispo member', hint: 'of the commission base, when a dispo member is on the deal', type: 'pct' },
    { key: 'noCommission', label: 'No commission (owners)', hint: 'Nothing paid when these people are the acq. manager or dispo member.', type: 'names' },
    { net: true },
    { key: 'dispoAfterAcq', label: 'Dispo paid after the acq. commission', hint: "For these acq. managers the dispo commission is taken from what's left after theirs.", type: 'names' },
  ] },
  { title: 'Manager commission', sub: 'Paid to one manager on the deals of the reps listed — on the acquisition side unless "Paid on" says otherwise.', rules: [
    { key: 'manager.name', label: 'Manager', type: 'person' },
    { key: 'manager.rate', label: 'Rate', hint: 'of the commission base', type: 'pct' },
    { key: 'manager.reps', label: 'On deals by', type: 'reps' },
    // Luke, Oct 16: the manager is paid when a listed rep acquired the deal,
    // never off the dispo side — editable here.
    { key: 'manager.side', label: 'Paid on', hint: 'which side of the deal a listed rep must be on', type: 'side' },
  ] },
  { title: 'Pod override', sub: 'Paid to the pod lead on closed deals by the reps who report to them (Dropdown lists › Reports to).', rules: [
    { key: 'override.name', label: 'Pod lead', type: 'person' },
    { key: 'override.rate', label: 'Rate', hint: 'of net assignment', type: 'pct' },
    { key: 'override.from', label: 'Only on deals with COE from', type: 'date' },
    { key: 'override.status', label: 'Paid when the deal is', type: 'status', optional: true },
  ] },
  { title: 'Transaction coordinator', rules: [
    { key: 'tcFee', label: 'TC fee per deal', hint: 'taken off the commission base', type: 'money' },
    { key: 'tcFeeStatuses', label: 'TC fee charged when the deal is', hint: 'Assigned = status Assigned, or a VPG assignment price is in (and it isn’t cancelled). Pending = any open deal, Assigned ones included.', type: 'statuses' },
    { key: 'tcComm', label: 'TC commission per deal', type: 'money' },
    { key: 'tcCommStatuses', label: 'TC commission paid when the deal is', type: 'statuses' },
    { key: 'tcName', label: 'TC (paid the TC commission)', type: 'person' },
  ] },
];
const DEF = Object.fromEntries(SECTIONS.flatMap((s) => s.rules.filter((d) => d.key).map((d) => [d.key, { ...d, group: s.title }])));
const defOf = (key) => (key.startsWith(NET) ? { key, label: key.slice(NET.length), hint: 'paid on net assignment instead of the commission base', type: 'pct', net: true, group: 'Paid on net assignment' } : DEF[key] || { key, label: key, type: 'json', group: 'Other' });

const SIDES = [['acq', 'Acquisitions only — nothing from the dispo side'], ['both', 'Acquisitions and dispositions']];
function show(type, v) {
  if (type === 'side') return SIDES.find(([k]) => k === (v || 'acq'))[1];
  if (v === null || v === undefined) return <span className="text-zinc-400">not set</span>;
  if (type === 'pct') return `${Math.round(v * 1000) / 10}%`;
  if (type === 'money') return money(v);
  if (type === 'names') return v.length ? v.join(', ') : <span className="text-zinc-400">nobody</span>;
  if (type === 'statuses') return v.length ? RULE_STATUSES.filter(([k]) => v.includes(k)).map(([, l]) => l).join(', ') : <span className="text-zinc-400">never</span>;
  if (type === 'status') return STATUSES.find(([k]) => k === v)?.[1] || v;
  if (type === 'date') return v ? day(v) : <span className="text-zinc-400">any date</span>;
  if (type === 'reps') return v.length ? v.map((x) => `${x.rep}${x.coeFrom ? ` (from ${day(x.coeFrom, false)})` : ''}${x.coeBefore ? ` (COE before ${day(x.coeBefore, false)})` : ''}`).join(', ') : <span className="text-zinc-400">nobody</span>;
  if (type === 'json') return JSON.stringify(v);
  return String(v);
}

function Names({ value, onChange, people }) {
  const [pick, setPick] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((x) => (
        <span key={x} className="inline-flex items-center gap-1 rounded-md bg-tan-100 px-2 py-1 text-[13px]">{x}
          <button type="button" onClick={() => onChange(value.filter((y) => y !== x))} className="text-zinc-400 hover:text-red-600" aria-label={`Remove ${x}`}>×</button></span>
      ))}
      <select value={pick} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); setPick(''); }} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px]">
        <option value="">+ add</option>
        {people.filter((p) => !value.includes(p)).map((p) => <option key={p}>{p}</option>)}
      </select>
    </div>
  );
}
// Deal statuses (Assigned = status Assigned, or a VPG assignment price in and
// not cancelled — Luke, Oct 14), for the TC fee / commission rules.
function Statuses({ value, onChange }) {
  return (
    <div className="flex gap-3 text-[13px] h-9 items-center">
      {RULE_STATUSES.map(([k, l]) => (
        <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />{l}</label>
      ))}
    </div>
  );
}
// Each rep with the date their deals start paying the manager (Luke, Oct
// 16: "when the rep started and when their deals start to pay anthony").
// Empty = every deal. An older end date (`coeBefore`) shows with a Clear.
function Reps({ value, onChange, people }) {
  const set = (i, patch) => { const r = [...value]; const x = { ...r[i], ...patch }; Object.keys(x).forEach((k) => (x[k] == null || x[k] === '') && delete x[k]); r[i] = x; onChange(r); };
  return (
    <div className="flex flex-col gap-2">
      {value.map((x, i) => (
        <div key={x.rep} className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="w-44 font-medium text-navy-800">{x.rep}</span>
          <span className="text-zinc-500">pays from deals closing on</span>
          <input type="date" value={x.coeFrom || ''} onChange={(e) => set(i, { coeFrom: e.target.value || null })} className="h-8 rounded-md border border-zinc-200 px-2" />
          {x.coeFrom ? <button type="button" onClick={() => set(i, { coeFrom: null })} className="text-zinc-500 hover:underline">clear</button> : <span className="text-[12px] text-zinc-400">empty = every deal</span>}
          {x.coeBefore && <span className="text-[12px] text-amber-800">old end date {x.coeBefore} <button type="button" onClick={() => set(i, { coeBefore: null })} className="underline">clear</button></span>}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="ml-auto text-red-600 hover:underline">remove</button>
        </div>
      ))}
      <select value="" onChange={(e) => e.target.value && onChange([...value, { rep: e.target.value }])} className="h-8 w-48 rounded-md border border-zinc-200 bg-white px-2 text-[13px]">
        <option value="">+ add a rep</option>{people.filter((p) => !value.some((x) => x.rep === p)).map((p) => <option key={p}>{p}</option>)}
      </select>
    </div>
  );
}

function ValueInput({ def, value, onChange, people }) {
  const t = def.type;
  if (t === 'pct') return <div className="w-36"><Pct value={value} onChange={onChange} /></div>;
  if (t === 'money') return <div className="w-36"><Money value={value} onChange={onChange} /></div>;
  if (t === 'names') return <Names value={value || []} onChange={onChange} people={people} />;
  if (t === 'statuses') return <Statuses value={value || []} onChange={onChange} />;
  if (t === 'reps') return <Reps value={value || []} onChange={onChange} people={people} />;
  if (t === 'side') return <div className="flex flex-col gap-1.5 text-[13.5px]">{SIDES.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="radio" checked={(value || 'acq') === k} onChange={() => onChange(k)} />{l}</label>)}</div>;
  if (t === 'date') return <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value || null)} className={`${inputCls} w-48`} />;
  if (t === 'status') return <select value={value || 'COMPLETE'} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-48`}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  if (t === 'person') {
    const opts = value && !people.includes(value) ? [value, ...people] : people;
    return <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-56`}>{!value && <option value="">—</option>}{opts.map((p) => <option key={p}>{p}</option>)}</select>;
  }
  return <span className="text-zinc-500 text-[13px]">Not editable here.</span>;
}

const defaultValue = (def) => ({ pct: 0.5, money: 0, names: [], statuses: [], reps: [], person: '', date: null, status: 'COMPLETE', side: 'acq' })[def.type] ?? null;

function Editor({ def, t, today, current, people, impactOf, onSave, onCancel }) {
  const [value, setValue] = useState(() => structuredClone(current ?? defaultValue(def)));
  const [from, setFrom] = useState(today < t.since ? t.since : today);
  const [stop, setStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const change = { key: def.key, from, value: stop ? null : value };
  const next = applyChange(t, change, null, null);
  const impact = next.error ? null : impactOf(next);
  const tl = t.timelines[def.key] || [];
  const later = tl.find((e) => e.from > from);
  const onDay = tl.find((e) => e.from === from);
  const save = async () => {
    if (next.error) { setErr(next.error); return; }
    if (impact?.closed && !window.confirm(`This changes commissions on ${impact.closed} closed deal${impact.closed === 1 ? '' : 's'} (${signed(impact.closedDelta)} in total). Save anyway?`)) return;
    setBusy(true); setErr(null);
    try { await onSave(change); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg border border-navy-100 bg-navy-50/40 p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-6">
        <Field label={def.net ? `${def.label} — rate on net assignment` : `New value — ${def.label}`} hint={def.hint}>
          {stop ? <span className="block h-9 leading-9 text-zinc-500">Not paid on net from this date</span> : <ValueInput def={def} value={value} onChange={setValue} people={people} />}
        </Field>
        <Field label="Takes effect on" hint="Deals with a COE on or after this date use the new value.">
          <input type="date" value={from} min={t.since} onChange={(e) => setFrom(e.target.value || today)} className={`${inputCls} w-48`} />
        </Field>
        {def.net && current != null && (
          <label className="flex items-center gap-1.5 text-[13px] mt-6"><input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} />Stop paying on net</label>
        )}
      </div>
      <div className="text-[12.5px] text-zinc-600 flex flex-col gap-0.5">
        {onDay && <span>This replaces the change already set for {day(from)} ({show(def.type, onDay.value)}).</span>}
        {later && <span className="text-amber-800">A later change on {day(later.from)} ({show(def.type, later.value)}) still takes over from that date.</span>}
        {from === t.since && <span className="text-amber-800">This date is the tracker's start — the value applies to every deal on file.</span>}
        {err || next.error
          ? <span className="text-red-700">{err || next.error}</span>
          : impact && <span>{impact.deals ? `Changes commissions on ${impact.deals} deal${impact.deals === 1 ? '' : 's'}: ${signed(impact.delta)} in total${impact.closed ? `, of which ${impact.closed} already closed: ${signed(impact.closedDelta)}` : ''}.` : 'No deal on file changes with this.'}</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : `Save — from ${day(from, false)}`}</button>
        <button type="button" onClick={onCancel} className="h-9 px-3 rounded-lg border border-zinc-200 bg-white font-medium">Cancel</button>
      </div>
    </div>
  );
}

function History({ def, tl, today, onRemove }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead><tr className="text-left text-zinc-500 border-b border-tan-200">
          <th className="py-1.5 pr-4 font-medium">Value</th><th className="py-1.5 pr-4 font-medium">Takes effect</th><th className="py-1.5 pr-4 font-medium">Changed by</th><th className="py-1.5 pr-4 font-medium">When</th><th />
        </tr></thead>
        <tbody>
          {[...tl].reverse().map((e, i) => {
            const now = entryAt(tl, today) === e;
            return (
              <tr key={e.from} className="border-b border-tan-100 last:border-0">
                <td className="py-1.5 pr-4 tabular-nums">{show(def.type, e.value)}{now && <span className="ml-2 rounded bg-navy-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">in effect</span>}{e.from > today && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">coming up</span>}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap">{e.from === TRACKER_START ? 'Since the tracker began' : day(e.from)}</td>
                <td className="py-1.5 pr-4">{e.by || <span className="text-zinc-400">—</span>}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap text-zinc-500">{when(e.at)}</td>
                <td className="py-1.5 text-right">{i < tl.length - 1 && <button type="button" onClick={() => onRemove(e)} className="text-red-600 hover:underline">remove</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RuleRow({ def, t, today, editing, setEditing, open, setOpen, people, impactOf, onSave, onRemove }) {
  const tl = t.timelines[def.key] || [];
  const cur = entryAt(tl, today);
  const coming = tl.filter((e) => e.from > today);
  const isOpen = open === def.key;
  return (
    <div id={`rule-${def.key}`} className="py-3 border-b border-tan-100 last:border-0 scroll-mt-24">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="w-64 min-w-0">
          <div className="text-[13.5px] font-medium text-navy-800">{def.label}</div>
          {def.hint && <div className="text-[11.5px] text-zinc-400">{def.hint}</div>}
        </div>
        <div className="flex-1 min-w-[180px] text-[14px] tabular-nums">{show(def.type, cur?.value)}</div>
        <span className="rounded-full bg-tan-100 px-2.5 py-0.5 text-[12px] text-tan-700" title={cur?.by ? `Set by ${cur.by}${cur.at ? `, ${when(cur.at)}` : ''}` : undefined}>{cur ? sinceText(cur.from) : 'not set'}</span>
        {coming.map((e) => (
          <span key={e.from} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[12px] text-amber-800">→ {show(def.type, e.value)} from {day(e.from, false)}</span>
        ))}
        <div className="flex gap-2 ml-auto">
          {tl.length > 0 && <button type="button" onClick={() => setOpen(isOpen ? null : def.key)} className="h-8 px-2.5 rounded-md text-[13px] text-navy-700 hover:bg-navy-50">{isOpen ? 'Hide history' : `History (${tl.length})`}</button>}
          {def.type !== 'json' && <button type="button" onClick={() => setEditing(editing === def.key ? null : def.key)} className="h-8 px-3 rounded-md border border-navy-200 bg-white text-[13px] font-medium text-navy-700 hover:bg-navy-50">Edit</button>}
        </div>
      </div>
      {editing === def.key && <Editor def={def} t={t} today={today} current={cur?.value ?? null} people={people} impactOf={impactOf} onSave={onSave} onCancel={() => setEditing(null)} />}
      {isOpen && <History def={def} tl={tl} today={today} onRemove={(e) => onRemove(def, e)} />}
    </div>
  );
}


// Commission by person (Luke, Oct 16: "where is a specific section to adjust
// commission per rep?"): everyone the rules name, with what they're paid
// today on each side of a deal; each Edit opens the rule it comes from.
function ByPerson({ t, today, lists, onEdit }) {
  const r = rulesAt(t, today);
  const pct = (x) => `${Math.round((x || 0) * 1000) / 10}%`;
  const none = (r.noCommission || []).map((x) => x.toLowerCase());
  const m = r.manager || {}; const o = r.override || {};
  const mgrReps = (m.reps || []).filter((x) => !x.coeBefore || x.coeBefore > today);
  const fromTxt = (x) => (x.coeFrom ? ` (from ${day(x.coeFrom, false)})` : '');
  const reportsTo = lists?.reportsTo || {};
  const acqTeam = lists?.acqTeam || []; const dispo = lists?.dispoMembers || [];
  const people = [...new Set([...acqTeam, ...dispo, m.name, o.name, r.tcName].filter(Boolean))].sort();
  const btn = (key, label = 'Edit') => <button type="button" onClick={() => onEdit(key)} className="ml-1.5 text-[12px] font-medium text-navy-700 hover:underline">{label}</button>;
  const cell = (txt, key, extra) => <div className="text-[13px] leading-snug">{txt}{key && btn(key)}{extra}</div>;
  const dash = <span className="text-zinc-300">—</span>;
  return (
    <div className="overflow-x-auto -mx-5">
      <table className="w-full text-left">
        <thead className="text-[12px] text-zinc-500 bg-tan-50/70">
          <tr>{['Person', 'Acquisition side', 'Dispo side', 'Manager / pod lead', 'Reports to'].map((h, i) => <th key={h} className={`${i ? '' : 'pl-5'} px-3 py-2 font-medium whitespace-nowrap`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const owner = none.includes(p.toLowerCase());
            const net = r.acqOfNet?.[p];
            const acq = !acqTeam.includes(p) ? dash
              : owner ? cell('None (no commission)', 'noCommission')
                : net != null ? cell(`${pct(net)} of net assignment`, `${NET}${p}`)
                  : cell(<>{pct(r.acqRate)} of the commission base <span className="text-zinc-400">(standard rate)</span></>, 'acqRate', btn(`${NET}${p}`, 'Pay on net instead'));
            const dsp = !dispo.includes(p) ? dash : owner ? cell('None (no commission)', 'noCommission') : cell(`${pct(r.dispoRate)} of the commission base`, 'dispoRate');
            const roles = [];
            if (p === m.name) roles.push(cell(<><b className="font-semibold">Manager</b>: {pct(m.rate)} on {m.side === 'both' ? 'deals' : 'acquisitions'} by {mgrReps.length ? mgrReps.map((x) => `${x.rep.split(' ')[0]}${fromTxt(x)}`).join(', ') : 'nobody right now'}</>, 'manager.reps'));
            if (p === o.name) roles.push(cell(<><b className="font-semibold">Pod lead</b>: {pct(o.rate)} of net on closed deals by the reps who report to them</>, 'override.rate'));
            if (p === r.tcName) roles.push(cell(<><b className="font-semibold">TC</b>: {money(r.tcComm)} per deal</>, 'tcComm'));
            const lead = reportsTo[p];
            const mgrOf = mgrReps.some((x) => x.rep === p) ? m.name : null;
            return (
              <tr key={p} className="border-t border-tan-100 align-top">
                <td className="pl-5 px-3 py-2.5 text-[13.5px] font-semibold text-navy-800 whitespace-nowrap">{p}</td>
                <td className="px-3 py-2.5">{acq}</td>
                <td className="px-3 py-2.5">{dsp}</td>
                <td className="px-3 py-2.5">{roles.length ? <div className="flex flex-col gap-1">{roles}</div> : dash}</td>
                <td className="px-3 py-2.5 text-[13px]">{lead || mgrOf ? <>{lead || mgrOf}{mgrOf && <span className="text-zinc-500"> · pays {mgrOf.split(' ')[0]} {pct(m.rate)} on their acquisitions</span>}{lead && lead === o.name && <span className="text-zinc-500"> · pays {lead.split(' ')[0]} {pct(o.rate)} of net when closed</span>}</> : dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-5 pt-3 text-[12px] text-zinc-500">Reports to is set in Settings › Dropdown Lists › Reports to (the pod columns). A standard rate change applies to everyone on it; "Pay on net instead" gives one person their own rate.</p>
    </div>
  );
}

export default function RulesView() {
  const s = useDeals();
  const [t, setT] = useState(null);
  const [meta, setMeta] = useState(null);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const today = laToday();
  useEffect(() => { readSetting('deal-rules').then((x) => { setT(toTimelines(x.value)); setMeta(x); }).catch((e) => setMsg({ error: true, text: e.message })); }, []);
  const people = useMemo(() => [...new Set([...(s.lists?.acqTeam || []), ...(s.lists?.dispoMembers || [])])].sort(), [s.lists]);

  // What a change does to the deals on file (pending deals with no buyer yet
  // have a negative base in the sheet's formulas — no commission is owed on
  // them, so they're left out).
  const impactOf = (next) => {
    if (!t || !s.raw.length) return null;
    let deals = 0; let closed = 0; let delta = 0; let closedDelta = 0;
    for (const d of s.raw) {
      const before = compute(d, t, s.lists);
      if (n(before.commBase) < 0) continue;
      const a = total(before); const b = total(compute(d, next, s.lists));
      if (Math.abs(a - b) < 0.005) continue;
      deals++; delta += b - a;
      if (d.status === 'COMPLETE') { closed++; closedDelta += b - a; }
    }
    return { deals, closed, delta, closedDelta };
  };

  if (!t) return <div className="py-16 text-center text-zinc-400">{msg?.text || 'Loading…'}</div>;
  const done = (x, text) => { setT(toTimelines(x.value)); setMeta(x); setMsg({ text }); loadDeals(); };
  const onSave = async (change) => {
    const x = await changeRule(change);
    setEditing(null);
    done(x, `Saved — ${defOf(change.key).label} ${change.from === t.since ? 'changed for every deal' : `changes for deals with a COE from ${day(change.from)}`}.`);
  };
  const onRemove = async (def, e) => {
    const next = applyChange(t, { key: def.key, from: e.from, remove: true });
    const im = next.error ? null : impactOf(next);
    if (!window.confirm(`Take back the change to ${def.label} on ${day(e.from)}?${im?.deals ? ` It moves commissions on ${im.deals} deal${im.deals === 1 ? '' : 's'} (${signed(im.delta)}${im.closed ? `, ${im.closed} closed` : ''}).` : ''}`)) return;
    try { done(await changeRule({ key: def.key, from: e.from, remove: true }), `Removed the ${day(e.from)} change to ${def.label}.`); } catch (er) { setMsg({ error: true, text: er.message }); }
  };
  const row = (def) => <RuleRow key={def.key} def={def} t={t} today={today} editing={editing} setEditing={setEditing} open={open} setOpen={setOpen} people={people} impactOf={impactOf} onSave={onSave} onRemove={onRemove} />;
  // "Paid on net" is one rule per person; anyone with a rate on file is listed.
  const netKeys = Object.keys(t.timelines).filter((k) => k.startsWith(NET) && t.timelines[k].some((e) => e.value != null));
  const pendingNet = editing?.startsWith(NET) && !netKeys.includes(editing) ? editing : null;
  // Every dated change, newest start date first.
  const changes = Object.entries(t.timelines).flatMap(([k, tl]) => tl.slice(1).map((e) => ({ ...e, key: k }))).sort((a, b) => (a.from === b.from ? (a.key < b.key ? -1 : 1) : a.from < b.from ? 1 : -1));
  const byDate = changes.reduce((m, c) => { (m[c.from] ||= []).push(c); return m; }, {});

  return (
    <div className="max-w-[1100px] flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Commission rules</h1>
        <p className="text-zinc-500 mt-0.5 max-w-3xl">The rates behind the deal tracker's commission columns (same as the old sheet's formulas). Each rule has its own start date: <b className="font-medium text-zinc-700">Edit</b> asks for the new value and the date it takes effect. Deals use the rules in effect on their COE (cancelled deals: their contract date), so deals that closed before a change keep what they had. Deals with numbers typed by hand keep them.{meta?.updatedBy && <> Last changed by {meta.updatedBy} on {new Date(meta.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</>}</p>
        {msg && <p className={`mt-2 text-[13px] ${msg.error ? 'text-red-700' : 'text-emerald-700'}`}>{msg.text}</p>}
      </div>
      <Section title="Commission by person" sub="What each person is paid today — Edit opens the rule it comes from below.">
        <ByPerson t={t} today={today} lists={s.lists} onEdit={(key) => { setEditing(key); setTimeout(() => document.getElementById(`rule-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }} />
      </Section>
      {SECTIONS.map((sec) => (
        <Section key={sec.title} title={sec.title} sub={sec.sub}>
          <div className="-my-3">
            {sec.rules.map((def) => {
              if (def.net) {
                return (
                  <div key="net" className="py-3 border-b border-tan-100">
                    <div className="text-[13.5px] font-medium text-navy-800">Paid on net assignment instead</div>
                    <div className="text-[11.5px] text-zinc-400 mb-1">These acq. managers get a share of net assignment instead of the acquisition rate. One rule per person, each with its own start date.</div>
                    <div className="pl-4 border-l-2 border-tan-200">
                      {netKeys.map((k) => row(defOf(k)))}
                      {pendingNet && row(defOf(pendingNet))}
                      <select value="" onChange={(e) => e.target.value && setEditing(NET + e.target.value)} className="mt-2 h-8 w-48 rounded-md border border-zinc-200 bg-white px-2 text-[13px]">
                        <option value="">+ add a person</option>{people.filter((p) => !netKeys.includes(NET + p)).map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                );
              }
              if (def.optional && !t.timelines[def.key]) return null;
              return row(def);
            })}
          </div>
        </Section>
      ))}
      <Section title="Changes by start date" sub="Every dated change on one list, so changes meant to start together share a date.">
        {!changes.length ? <p className="text-zinc-500 text-[13px]">No changes yet — every rule is as it was when the tracker began.</p> : (
          <div className="flex flex-col gap-3">
            {Object.entries(byDate).map(([d, cs]) => (
              <div key={d} className="flex flex-wrap gap-x-4 gap-y-1">
                <div className="w-40 text-[13px] font-semibold text-navy-800">{day(d)}{d > today && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">coming up</span>}</div>
                <div className="flex-1 flex flex-col gap-0.5 text-[13px]">
                  {cs.map((c) => {
                    const def = defOf(c.key);
                    return <div key={c.key}><span className="text-zinc-600">{def.group} › {def.label}:</span> <span className="tabular-nums">{show(def.type, c.value)}</span>{c.by && <span className="text-zinc-400"> · {c.by}{c.at ? `, ${when(c.at)}` : ''}</span>}</div>;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
