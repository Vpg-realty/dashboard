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
import SearchSelect from '../deals/SearchSelect.jsx';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, linkProps, setQuery } from '../shell/router.js';
import { personColor } from '../deals/personColor.js';
import { readSetting, changeRule, settingsUsers } from '../utils/dashApi.js';
import { keyName } from './team.js';
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
  { title: 'Pod override', sub: 'Paid to the pod lead on closed deals by the reps who report to them (their pod lead, set on Settings › Team).', rules: [
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
const defOf = (key) => (key.startsWith(NET) ? { key, label: key.slice(NET.length), hint: 'paid on net assignment instead of the commission base', type: 'pct', net: true, group: 'Paid on net assignment' }
  : key.startsWith('acqOf:') ? { key, label: `${key.slice(6)} · acq.`, hint: 'their own acquisition rate, of the commission base', type: 'pct', group: 'Personal rates' }
    : key.startsWith('dispoOf:') ? { key, label: `${key.slice(8)} · dispo`, hint: 'their own dispo rate, of the commission base', type: 'pct', group: 'Personal rates' }
      : DEF[key] || { key, label: key, type: 'json', group: 'Other' });

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
      <SearchSelect className="w-44" value={pick || ''} onChange={(v) => { if (v) onChange([...value, v]); setPick(''); }} clearable={false} pinned={[{ value: '', label: '+ add' }]} options={people.filter((p) => !value.includes(p)).map((p) => ({ value: p, label: p }))} />
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
      <SearchSelect className="w-48" value="" onChange={(v) => v && onChange([...value, { rep: v }])} clearable={false} pinned={[{ value: '', label: '+ add a rep' }]} options={people.filter((p) => !value.some((x) => x.rep === p)).map((p) => ({ value: p, label: p }))} />
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
  if (t === 'status') return <SearchSelect className="w-48" value={value || 'COMPLETE'} onChange={(v) => v && onChange(v)} clearable={false} sort={false} options={STATUSES.map(([k, l]) => ({ value: k, label: l }))} />;
  if (t === 'person') {
    const opts = value && !people.includes(value) ? [value, ...people] : people;
    return <SearchSelect className="w-56" value={value || null} onChange={(v) => onChange(v || '')} clearable={false} options={opts.map((p) => ({ value: p, label: p }))} />;
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


// Commission by person (Luke, Oct 16; simplified Oct 19 — site map: "Name |
// Acq % | Dispo % | Manager / pod lead | TC"; Nov 3 — the one place a
// person's rates are changed: "the commissions tab to be the only place where
// people can edit commissions … these charts need to be cleaned up … colors").
// Each person's acq / dispo rate with a coloured tag for how it's paid —
// company rate (grey), own rate of the commission base (navy) or of net
// assignment (amber) — and "Edit rates" opens the person's editor in the row.
const KIND = {
  company: { label: 'Company rate', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  base: { label: 'Own rate · of base', cls: 'bg-navy-50 text-navy-800 ring-navy-100' },
  net: { label: 'Own rate · of net', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  none: { label: 'Owner · no commission', cls: 'bg-zinc-50 text-zinc-500 ring-zinc-200' },
};
const Tag = ({ kind }) => <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[11.5px] font-semibold ring-1 ring-inset whitespace-nowrap ${KIND[kind].cls}`}>{KIND[kind].label}</span>;
const pctOf = (x) => `${Math.round((x || 0) * 10000) / 100}%`;
const pctTxt = (x) => (x == null ? '' : String(Math.round(x * 10000) / 100));
const valAt = (t, key, date) => entryAt(t.timelines[key] || [], date)?.value ?? null;
// Later changes already set for a rule (shown as "→ 35% from Nov 15").
const upcoming = (t, key, today) => (t.timelines[key] || []).filter((e) => e.from > today);

// How a person is paid on a side on `date`: { kind, rate, key }.
function acqOf(t, name, date) {
  const net = valAt(t, `${NET}${name}`, date); const own = valAt(t, `acqOf:${name}`, date);
  if (net != null) return { kind: 'net', rate: net, key: `${NET}${name}` };
  if (own != null) return { kind: 'base', rate: own, key: `acqOf:${name}` };
  return { kind: 'company', rate: valAt(t, 'acqRate', date), key: 'acqRate' };
}
function dispoOf(t, name, date) {
  const own = valAt(t, `dispoOf:${name}`, date);
  return own != null ? { kind: 'base', rate: own, key: `dispoOf:${name}` } : { kind: 'company', rate: valAt(t, 'dispoRate', date), key: 'dispoRate' };
}

function Choice({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-tan-50 p-1 ring-1 ring-tan-200">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold ${value === v ? 'bg-navy-700 text-white shadow-sm' : 'text-navy-800 hover:bg-white'}`}>{l}</button>
      ))}
    </div>
  );
}

// One person's rates (the Team panel's old Commission box, moved here):
// Acquisitions = company rate, own rate of the commission base, or own rate of
// net; Dispo = company rate or own rate; from a date. Saving writes only what
// changes on that date — going back to the company rate (or off net) clears
// the person's own rule, so they leave the "own rate" list.
function PersonEditor({ name, t, today, acqSide, dispoSide, impactOf, onSaved, onCancel }) {
  const a0 = acqOf(t, name, today); const d0 = dispoOf(t, name, today);
  const [aKind, setAKind] = useState(a0.kind);
  const [aRate, setARate] = useState(pctTxt(a0.rate));
  const [dKind, setDKind] = useState(d0.kind);
  const [dRate, setDRate] = useState(pctTxt(d0.rate));
  const [from, setFrom] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const company = { acq: valAt(t, 'acqRate', from), dispo: valAt(t, 'dispoRate', from) };
  const num = (x) => Number(x) / 100;
  const ok = (x) => x !== '' && Number(x) >= 0 && Number(x) <= 100;
  // The rule changes this edit makes, on `from`.
  const changes = [];
  const want = (key, value) => { if (JSON.stringify(valAt(t, key, from)) !== JSON.stringify(value)) changes.push({ key, from, value }); };
  if (acqSide) {
    want(`${NET}${name}`, aKind === 'net' ? num(aRate) : null);
    want(`acqOf:${name}`, aKind === 'base' ? num(aRate) : null);
  }
  if (dispoSide) want(`dispoOf:${name}`, dKind === 'base' ? num(dRate) : null);
  const valid = (!acqSide || aKind === 'company' || ok(aRate)) && (!dispoSide || dKind === 'company' || ok(dRate)) && /^\d{4}-\d{2}-\d{2}$/.test(from) && from >= t.since;
  let next = t;
  for (const c of changes) { const r = applyChange(next, c, null, null); if (r.error) { next = null; break; } next = r; }
  const impact = valid && next && changes.length ? impactOf(next) : null;
  const save = async () => {
    if (!valid || !changes.length) return;
    if (impact?.closed && !window.confirm(`This changes commissions on ${impact.closed} closed deal${impact.closed === 1 ? '' : 's'} (${signed(impact.closedDelta)} in total). Save anyway?`)) return;
    setBusy(true); setErr(null);
    let x = null;
    try { for (const c of changes) x = await changeRule(c); onSaved(x, changes); } catch (e) { setErr(e.message); if (x) onSaved(x, []); setBusy(false); }
  };
  const rateBox = (v, set, label) => (
    <span className="inline-flex items-center gap-1"><input value={v} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 30" aria-label={label} className={`${inputCls} !w-20 tabular-nums ${v === '' ? 'ring-1 ring-[#B42318]/40' : ''}`} /><span className="text-zinc-500">%</span></span>
  );
  return (
    <div className="rounded-xl border border-navy-100 bg-navy-50/40 p-4 flex flex-col gap-3 text-[13px]">
      <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-3">
        {acqSide && <>
          <span className="font-semibold text-navy-900">Acquisitions</span>
          <span className="flex flex-wrap items-center gap-2">
            <Choice value={aKind} onChange={(k) => { setAKind(k); if (k === 'company') setARate(pctTxt(company.acq)); }} options={[['company', `Company rate (${pctOf(company.acq)})`], ['base', 'Own rate · of base'], ['net', 'Own rate · of net']]} />
            {aKind !== 'company' && rateBox(aRate, setARate, 'Acquisition %')}
          </span>
        </>}
        {dispoSide && <>
          <span className="font-semibold text-navy-900">Dispo</span>
          <span className="flex flex-wrap items-center gap-2">
            <Choice value={dKind} onChange={(k) => { setDKind(k); if (k === 'company') setDRate(pctTxt(company.dispo)); }} options={[['company', `Company rate (${pctOf(company.dispo)})`], ['base', 'Own rate · of base']]} />
            {dKind !== 'company' && rateBox(dRate, setDRate, 'Dispo %')}
          </span>
        </>}
        <span className="font-semibold text-navy-900">Takes effect</span>
        <span className="flex flex-wrap items-center gap-2"><input type="date" value={from} min={t.since} onChange={(e) => setFrom(e.target.value || today)} className={`${inputCls} !w-40`} aria-label="Takes effect on" /><span className="text-zinc-500">deals with a COE from this date — closed deals before it keep what they had</span></span>
      </div>
      <div className="text-[12.5px] text-zinc-600">
        {err ? <span className="text-red-700">{err}</span>
          : !changes.length ? 'Nothing to change yet.'
            : impact ? (impact.deals ? `Changes commissions on ${impact.deals} deal${impact.deals === 1 ? '' : 's'}: ${signed(impact.delta)} in total${impact.closed ? `, of which ${impact.closed} already closed: ${signed(impact.closedDelta)}` : ''}.` : 'No deal on file changes with this.') : null}
        <span className="block text-zinc-400">Commission base = net assignment − TC fee. Company rate = the rate in “Acquisition and Dispo” below.</span>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy || !valid || !changes.length} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : `Save — from ${day(from, false)}`}</button>
        <button type="button" onClick={onCancel} className="h-9 px-3 rounded-lg border border-zinc-200 bg-white font-medium">Cancel</button>
      </div>
    </div>
  );
}

function RateCell({ side, t, today }) {
  const later = side.key === 'acqRate' || side.key === 'dispoRate' ? [] : upcoming(t, side.key, today);
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[17px] font-bold tabular-nums text-navy-900 leading-none">{pctOf(side.rate)}</span>
      <Tag kind={side.kind} />
      {later.map((e) => <span key={e.from} className="text-[11.5px] font-semibold text-amber-800">→ {e.value == null ? 'company rate' : pctOf(e.value)} from {day(e.from, false)}</span>)}
    </div>
  );
}

// The order (Luke, Nov 3: "start with owners, then tc, then managers, then
// reps"); anyone not active on Settings › Team goes to Past Team, for
// reference only.
const GROUPS = [['owner', 'Owners'], ['tc', 'Transaction Coordinator'], ['manager', 'Managers'], ['rep', 'Reps']];
function groupOf(p, users, r) {
  const lc = p.toLowerCase();
  if ((r.noCommission || []).some((x) => x.toLowerCase() === lc)) return 'owner';
  const u = (users || []).find((x) => [keyName(x), `${x.name || ''} ${x.last_name || ''}`.trim(), x.name].some((n) => n && n.toLowerCase() === lc));
  if (u?.role === 'owner') return 'owner';
  if (p === r.tcName || u?.role === 'tc') return u && u.status === 'inactive' ? 'past' : 'tc';
  if (!users) return 'rep';
  if (!u || u.status === 'inactive') return 'past';
  return u.role === 'manager' ? 'manager' : 'rep';
}

function ByPerson({ t, today, lists, users, onEdit, person, setPerson, impactOf, onSaved }) {
  const r = rulesAt(t, today);
  const none = (r.noCommission || []).map((x) => x.toLowerCase());
  const m = r.manager || {}; const o = r.override || {};
  const mgrReps = (m.reps || []).filter((x) => !x.coeBefore || x.coeBefore > today);
  const acqTeam = lists?.acqTeam || []; const dispo = lists?.dispoMembers || [];
  const everyone = [...new Set([...acqTeam, ...dispo, m.name, o.name, r.tcName].filter(Boolean))].sort();
  const by = Object.fromEntries([...GROUPS.map(([g]) => [g, []]), ['past', []]]);
  for (const p of everyone) by[groupOf(p, users, r)].push(p);
  const [showPast, setShowPast] = useState(false);
  const dash = <span className="text-zinc-300">—</span>;
  const Lead = ({ main, sub, k }) => (
    <button type="button" onClick={() => onEdit(k)} title="Change this rule" className="group text-left">
      <span className="block text-[13.5px] font-semibold tabular-nums text-navy-900 group-hover:underline underline-offset-2">{main}</span>
      {sub && <span className="block text-[11.5px] text-zinc-500">{sub}</span>}
    </button>
  );
  const row = (p, i, past) => {
    const owner = none.includes(p.toLowerCase());
    const isAcq = acqTeam.includes(p); const isDispo = dispo.includes(p);
    const lead = [];
    if (p === m.name) lead.push(<Lead key="m" main={`${pctOf(m.rate)} manager`} sub={`on ${m.side === 'both' ? 'deals' : 'acquisitions'} by ${mgrReps.length ? mgrReps.map((x) => x.rep.split(' ')[0]).join(', ') : 'nobody right now'}`} k="manager.rate" />);
    if (p === o.name) lead.push(<Lead key="o" main={`${pctOf(o.rate)} pod lead`} sub="of net, closed deals by their reps" k="override.rate" />);
    const open = person === p;
    const editable = !past && !owner && (isAcq || isDispo);
    return [
      <tr key={p} id={`person-${p}`} className={`scroll-mt-24 border-t border-tan-100 align-top ${past ? 'opacity-60' : ''} ${open ? 'bg-navy-50/50' : i % 2 ? 'bg-tan-50/40' : ''}`}>
        <td className="pl-5 px-3 py-3 whitespace-nowrap">
          <span className="flex items-center gap-2 text-[13.5px] font-semibold text-navy-800"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: personColor(p) }} />
            <a {...linkProps(`/settings/people?who=${encodeURIComponent(p)}`)} title="Open them on Team" className="hover:underline underline-offset-2">{p}</a></span>
        </td>
        <td className="px-3 py-3">{!isAcq ? dash : owner ? <Tag kind="none" /> : <RateCell side={acqOf(t, p, today)} t={t} today={today} />}</td>
        <td className="px-3 py-3">{!isDispo ? dash : owner ? <Tag kind="none" /> : <RateCell side={dispoOf(t, p, today)} t={t} today={today} />}</td>
        <td className="px-3 py-3">{lead.length ? <div className="flex flex-col gap-1.5">{lead}</div> : dash}</td>
        <td className="px-3 py-3">{p === r.tcName ? <Lead main={`${money(r.tcComm)} / deal`} sub={`fee ${money(r.tcFee)} off each deal`} k="tcComm" /> : dash}</td>
        <td className="pr-5 px-3 py-3 text-right whitespace-nowrap">
          {editable && <button type="button" onClick={() => setPerson(open ? null : p)} className={`h-8 px-3 rounded-md text-[13px] font-semibold ${open ? 'text-zinc-500 hover:underline' : 'border border-navy-200 bg-white text-navy-700 hover:bg-navy-50'}`}>{open ? 'Close' : 'Edit rates'}</button>}
        </td>
      </tr>,
      open && editable && (
        <tr key={`${p}:edit`} className="bg-navy-50/50"><td colSpan={6} className="px-5 pb-4">
          <PersonEditor name={p} t={t} today={today} acqSide={isAcq} dispoSide={isDispo} impactOf={impactOf} onSaved={onSaved} onCancel={() => setPerson(null)} />
        </td></tr>
      ),
    ];
  };
  return (
    <div className="overflow-x-auto -mx-5">
      <table className="w-full text-left">
        <thead className="text-[12px] font-semibold text-navy-700 bg-navy-50/70">
          <tr>{['Person', 'Acquisitions', 'Dispo', 'Manager / Pod Lead', 'TC', ''].map((h, i) => <th key={i} className={`${i ? '' : 'pl-5'} px-3 py-2 whitespace-nowrap`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {[...GROUPS.filter(([g]) => by[g].length).map(([g, label]) => [g, label, by[g]]), ...(by.past.length ? [['past', 'Past Team · For Reference', showPast ? by.past : []]] : [])].flatMap(([g, label, list]) => [
            <tr key={`g:${g}`} className="border-t border-tan-200">
              <td colSpan={6} className={`pl-5 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.12em] ${g === 'past' ? 'bg-zinc-50 text-zinc-500' : 'bg-tan-50 text-tan-800'}`}>
                {g === 'past' ? <button type="button" onClick={() => setShowPast((x) => !x)} className="uppercase tracking-[0.12em] hover:underline">{showPast ? '▾' : '▸'} {label} · {by.past.length}</button> : `${label} · ${list.length}`}
                {g === 'past' && <span className="ml-2 normal-case tracking-normal font-normal">not active on Team — kept for their past deals, not editable</span>}
              </td>
            </tr>,
            ...list.map((p, i) => row(p, i, g === 'past')),
          ])}
        </tbody>
      </table>
      <div className="px-5 pt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-zinc-500">
        <span className="font-semibold text-navy-800">Key:</span>
        <Tag kind="company" /> the company rate below <Tag kind="base" /> their own rate, of the commission base <Tag kind="net" /> their own rate, of net assignment
        <span className="w-full">Edit rates changes a person’s acquisition and dispo rates from a date you pick — set them back to Company rate to take them off their own rate. Manager, pod lead and TC numbers open their rule below. <a href="#rule-history" className="text-navy-700 underline">History ›</a></span>
      </div>
    </div>
  );
}

// Settings layout A (Luke, Oct 16) shows the rules on three pages:
// Commissions (acq / dispo, by person, changes by date), Pods (manager and
// pod override) and TC pay. `only` = the section titles a page shows.
// `?edit=<rule key>` opens that rule's editor (Commission by person's Edit
// links to a rule on another page).
// Since Oct 19 (site map) every rule is on the one Commissions page — TC Pay
// and Pods merged in.
const ALL = SECTIONS.map((x) => x.title);
export default function RulesView({ only = ALL, byPerson = true, changesList = true }) {
  const s = useDeals();
  const { query } = useLocation();
  const [t, setT] = useState(null);
  const [meta, setMeta] = useState(null);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(() => query.get('edit'));
  const [open, setOpen] = useState(null);
  // Who's active on Settings › Team (Who Gets Paid What's order and Past Team).
  const [users, setUsers] = useState(null);
  useEffect(() => { settingsUsers().then((x) => setUsers(x.users || [])).catch(() => setUsers(null)); }, []);
  // The person whose rates are open (?person=, also from Settings › Team).
  const person = query.get('person') || null;
  const today = laToday();
  useEffect(() => { readSetting('deal-rules').then((x) => { setT(toTimelines(x.value)); setMeta(x); }).catch((e) => setMsg({ error: true, text: e.message })); }, []);
  // Arrived with ?edit= — bring that rule into view once the rules are in.
  const loaded = !!t;
  // …and with ?person= (Settings › Team's "Set on Commissions") — that row.
  useEffect(() => { if (loaded && person) setTimeout(() => document.getElementById(`person-${person}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded && editing) setTimeout(() => document.getElementById(`rule-${editing}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Every dated change, newest start date first.
  const changes = Object.entries(t.timelines).flatMap(([k, tl]) => tl.slice(1).map((e) => ({ ...e, key: k }))).sort((a, b) => (a.from === b.from ? (a.key < b.key ? -1 : 1) : a.from < b.from ? 1 : -1));
  const byDate = changes.reduce((m, c) => { (m[c.from] ||= []).push(c); return m; }, {});

  return (
    <div className="flex flex-col gap-5">
      {(meta?.updatedBy || msg) && (
        <div className="text-[13px]">
          {meta?.updatedBy && <span className="text-zinc-500">Rules last changed by {meta.updatedBy} on {new Date(meta.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. </span>}
          {msg && <span className={msg.error ? 'text-red-700' : 'text-emerald-700'}>{msg.text}</span>}
        </div>
      )}
      {byPerson && (
        <Section title="Who Gets Paid What" sub="Every person's rates today — the one place to change them. The company rates and other rules are below, then every change by date.">
          <ByPerson t={t} today={today} lists={s.lists} users={users} person={person} setPerson={(p) => setQuery({ person: p })} impactOf={impactOf}
            onSaved={(x, cs) => { if (x) done(x, cs.length ? `Saved ${person}'s rates — from ${day(cs[0].from)}.` : 'Saved part of the change.'); if (cs.length) setQuery({ person: null }); }}
            onEdit={(key) => {
              setEditing(key); setTimeout(() => document.getElementById(`rule-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
            }} />
        </Section>
      )}
      {SECTIONS.filter((sec) => only.includes(sec.title)).map((sec) => (
        <Section key={sec.title} title={sec.title} sub={sec.sub}>
          <div className="-my-3">
            {sec.rules.map((def) => {
              if (def.optional && !t.timelines[def.key]) return null;
              return row(def);
            })}
          </div>
        </Section>
      ))}
      {changesList && <div id="rule-history" className="scroll-mt-4" />}
      {changesList && <Section title="Changes by start date" sub="Every dated change on one list, so changes meant to start together share a date.">
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
      </Section>}
    </div>
  );
}
