// Settings › Commission rules (owners): the rates and names the deal
// tracker's commission columns use (D1 settings.deal_rules — never in the
// public repo). Before saving, shows what the change does to existing deals:
// every deal whose commissions are calculated (not typed by hand) is
// recalculated with the new rules.
import { useEffect, useMemo, useState } from 'react';
import { readSetting, writeSetting } from '../utils/dashApi.js';
import { useDeals, loadDeals } from '../deals/store.js';
import { compute } from '../deals/math.js';
import { money } from '../deals/format.js';

const signed = (x) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x))}`;
import { Section, Field, Pct, Money, SaveBar, inputCls } from './ui.jsx';

const STATUSES = [['PENDING', 'Pending'], ['COMPLETE', 'Closed'], ['CANCELLED', 'Cancelled']];
const n = (x) => (typeof x === 'number' ? x : 0);
const total = (d) => n(d.acqComm) + n(d.dispoComm) + n(d.mgrComm) + n(d.override) + n(d.tcComm);

function Names({ value, onChange, people }) {
  const [pick, setPick] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((x) => (
        <span key={x} className="inline-flex items-center gap-1 rounded-md bg-tan-100 px-2 py-1 text-[13px]">{x}
          <button onClick={() => onChange(value.filter((y) => y !== x))} className="text-zinc-400 hover:text-red-600" aria-label={`Remove ${x}`}>×</button></span>
      ))}
      <select value={pick} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); setPick(''); }} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px]">
        <option value="">+ add</option>
        {people.filter((p) => !value.includes(p)).map((p) => <option key={p}>{p}</option>)}
      </select>
    </div>
  );
}
function Statuses({ value, onChange }) {
  return (
    <div className="flex gap-3 text-[13px]">
      {STATUSES.map(([k, l]) => (
        <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />{l}</label>
      ))}
    </div>
  );
}

export default function RulesView() {
  const s = useDeals();
  const [saved, setSaved] = useState(null);
  const [r, setR] = useState(null);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { readSetting('deal-rules').then((x) => { setSaved(x.value); setR(structuredClone(x.value)); setMeta(x); }).catch((e) => setMsg({ error: true, text: e.message })); }, []);
  const people = useMemo(() => [...new Set([...(s.lists?.acqTeam || []), ...(s.lists?.dispoMembers || [])])].sort(), [s.lists]);

  // What the change does to the deals on file.
  const impact = useMemo(() => {
    if (!saved || !r || !s.raw.length) return null;
    let deals = 0; let closed = 0; let delta = 0; let closedDelta = 0;
    for (const d of s.raw) {
      const before = compute(d, saved, s.lists);
      // Pending deals with no buyer yet have a negative base in the sheet's
      // formulas — no commission is really owed on them, so leave them out.
      if (n(before.commBase) < 0) continue;
      const a = total(before); const b = total(compute(d, r, s.lists));
      if (Math.abs(a - b) < 0.005) continue;
      deals++; delta += b - a;
      if (d.status === 'COMPLETE') { closed++; closedDelta += b - a; }
    }
    return { deals, closed, delta, closedDelta };
  }, [saved, r, s.raw, s.lists]);

  if (!r) return <div className="py-16 text-center text-zinc-400">{msg?.text || 'Loading…'}</div>;
  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(r) !== JSON.stringify(saved);
  const save = async () => {
    if (impact?.closed && !window.confirm(`This changes commissions on ${impact.closed} closed deal${impact.closed === 1 ? '' : 's'} (${signed(impact.closedDelta)} in total). Save anyway?`)) return;
    setBusy(true); setMsg(null);
    try {
      const x = await writeSetting('deal-rules', r);
      setSaved(structuredClone(r)); setMeta(x); setMsg({ text: 'Saved — every deal now uses the new rules.' });
      loadDeals();
    } catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };
  const net = Object.entries(r.acqOfNet || {});
  return (
    <div className="max-w-[1100px] flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Commission rules</h1>
        <p className="text-zinc-500 mt-0.5">The rates behind the deal tracker's commission columns (same as the old sheet's formulas). Deals with numbers typed by hand keep them.{meta?.updatedBy && <> Last changed by {meta.updatedBy} on {new Date(meta.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</>}</p>
      </div>
      <Section title="Acquisition and dispo" sub="Commission base = net assignment − TC fee.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Acquisition manager" hint="of the commission base"><Pct value={r.acqRate} onChange={(v) => set({ acqRate: v })} /></Field>
          <Field label="Dispo member" hint="of the commission base, when a VPG dispo member is on the deal"><Pct value={r.dispoRate} onChange={(v) => set({ dispoRate: v })} /></Field>
          <div />
          <div className="md:col-span-3"><Field label="No commission (owners)" hint="Nothing paid when these people are the acq. manager or dispo member."><Names value={r.noCommission || []} onChange={(v) => set({ noCommission: v })} people={people} /></Field></div>
          <div className="md:col-span-3">
            <span className="block text-[12.5px] font-medium text-zinc-600 mb-1">Paid on net assignment instead</span>
            <div className="flex flex-col gap-2">
              {net.map(([who, rate]) => (
                <div key={who} className="flex items-center gap-2"><span className="w-48 text-[13.5px]">{who}</span><div className="w-32"><Pct value={rate} onChange={(v) => set({ acqOfNet: { ...r.acqOfNet, [who]: v } })} /></div>
                  <button onClick={() => { const x = { ...r.acqOfNet }; delete x[who]; set({ acqOfNet: x }); }} className="text-[13px] text-red-600 hover:underline">remove</button></div>
              ))}
              <select value="" onChange={(e) => e.target.value && set({ acqOfNet: { ...r.acqOfNet, [e.target.value]: 0.5 } })} className="h-8 w-48 rounded-md border border-zinc-200 bg-white px-2 text-[13px]">
                <option value="">+ add a person</option>{people.filter((p) => !(p in (r.acqOfNet || {}))).map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="md:col-span-3"><Field label="Dispo paid after the acq. commission" hint="For these acq. managers the dispo commission is taken from what's left after theirs."><Names value={r.dispoAfterAcq || []} onChange={(v) => set({ dispoAfterAcq: v })} people={people} /></Field></div>
        </div>
      </Section>
      <Section title="Manager commission" sub="Paid to one manager on the deals of the reps listed.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Manager"><select value={r.manager?.name || ''} onChange={(e) => set({ manager: { ...r.manager, name: e.target.value } })} className={inputCls}>{people.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Rate" hint="of the commission base"><Pct value={r.manager?.rate} onChange={(v) => set({ manager: { ...r.manager, rate: v } })} /></Field>
          <div />
          <div className="md:col-span-3 flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-zinc-600">On deals by</span>
            {(r.manager?.reps || []).map((x, i) => (
              <div key={x.rep} className="flex items-center gap-2 text-[13.5px]">
                <span className="w-48">{x.rep}</span>
                <span className="text-zinc-500">only when COE is before</span>
                <input type="date" value={x.coeBefore || ''} onChange={(e) => { const reps = [...r.manager.reps]; reps[i] = { ...x, coeBefore: e.target.value || undefined }; set({ manager: { ...r.manager, reps } }); }} className="h-8 rounded-md border border-zinc-200 px-2" />
                <button onClick={() => set({ manager: { ...r.manager, reps: r.manager.reps.filter((_, j) => j !== i) } })} className="text-red-600 hover:underline">remove</button>
              </div>
            ))}
            <select value="" onChange={(e) => e.target.value && set({ manager: { ...r.manager, reps: [...(r.manager?.reps || []), { rep: e.target.value }] } })} className="h-8 w-48 rounded-md border border-zinc-200 bg-white px-2 text-[13px]">
              <option value="">+ add a rep</option>{people.filter((p) => !(r.manager?.reps || []).some((x) => x.rep === p)).map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </Section>
      <Section title="Pod override" sub="Paid to the pod lead on closed deals by the reps who report to them (Dropdown lists › Reports to).">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Pod lead"><select value={r.override?.name || ''} onChange={(e) => set({ override: { ...r.override, name: e.target.value } })} className={inputCls}>{people.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Rate" hint="of net assignment"><Pct value={r.override?.rate} onChange={(v) => set({ override: { ...r.override, rate: v } })} /></Field>
          <Field label="From COE date"><input type="date" value={r.override?.from || ''} onChange={(e) => set({ override: { ...r.override, from: e.target.value } })} className={inputCls} /></Field>
        </div>
      </Section>
      <Section title="Transaction coordinator">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="TC fee per deal" hint="taken off the commission base"><Money value={r.tcFee} onChange={(v) => set({ tcFee: v })} /></Field>
          <Field label="Charged when the deal is"><Statuses value={r.tcFeeStatuses || []} onChange={(v) => set({ tcFeeStatuses: v })} /></Field>
          <Field label={`TC commission per deal (${r.tcName || 'TC'})`}><Money value={r.tcComm} onChange={(v) => set({ tcComm: v })} /></Field>
          <Field label="Paid when the deal is"><Statuses value={r.tcCommStatuses || []} onChange={(v) => set({ tcCommStatuses: v })} /></Field>
        </div>
      </Section>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => { setR(structuredClone(saved)); setMsg(null); }}
        msg={msg || (dirty && impact ? { text: impact.deals ? `Changes commissions on ${impact.deals} deal${impact.deals === 1 ? '' : 's'}: ${signed(impact.delta)} in total${impact.closed ? `, of which ${impact.closed} already closed: ${signed(impact.closedDelta)}` : ''}.` : 'No deal changes with these rules.' } : null)} />
    </div>
  );
}
