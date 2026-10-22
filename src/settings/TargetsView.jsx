// Settings › KPI Targets (Luke, Oct 22: "KPI targets — move into settings").
// One row per target: what it is today, since when, any change still to
// come, and its history. Edit = a value and the date it takes effect, so
// past weeks keep the targets they had. Saved in D1 settings kpi_targets
// (src/data/kpiTargets.js); the build bakes them in, so the board, the TV
// and the scorecards follow with the next refresh (~15 minutes).
import { useEffect, useState } from 'react';
import { readSetting, changeTarget } from '../utils/dashApi.js';
import { KPI_FIELDS, DEFAULT_TARGETS, TARGETS_SINCE, targetsOn } from '../data/kpiTargets.js';
import { KPI_TIMELINES, REPS } from '../data/config.js';
import { Section, inputCls } from './ui.jsx';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date());
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtVal = (f, v) => (f.money ? `$${Number(v).toLocaleString()}` : String(v));

export default function TargetsView() {
  const [store, setStore] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);   // { key, value, from }
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => { readSetting('kpi-targets').then((r) => setStore(r.value || { timelines: {} })).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="text-red-700">{err}</div>;
  if (!store) return <div className="text-zinc-500">Loading…</div>;
  const d0 = today();
  const now = targetsOn(store, d0);
  // The site shows what was baked in at the last deploy; after a change it
  // catches up with the next refresh.
  const live = targetsOn(KPI_TIMELINES, d0);
  const pending = KPI_FIELDS.some((f) => live[f.key] !== now[f.key]);

  const submit = async (change) => {
    setBusy(true); setErr(null);
    try { const r = await changeTarget(change); setStore(r.value); setEdit(null); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      {pending && <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">Saved. The board, the TV and the scorecards pick up the new targets with the next refresh (about 15 minutes).</div>}
      <Section title="KPI Targets" sub={`Per rep. Team targets are these × the reps on the board (${REPS.length} today). A change takes effect from the date you pick, so weeks before it keep their old targets and their scores don't move.`}>
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left text-[12.5px] text-zinc-500 border-b border-tan-200">
              <th className="py-2 pr-4 font-semibold">Target</th>
              <th className="py-2 pr-4 font-semibold">Today</th>
              <th className="py-2 pr-4 font-semibold">Since</th>
              <th className="py-2 pr-4 font-semibold">Coming up</th>
              <th className="py-2 w-40" />
            </tr>
          </thead>
          <tbody>
            {KPI_FIELDS.map((f) => {
              const line = store.timelines?.[f.key] || [];
              const past = line.filter((c) => c.from <= d0);
              const since = past.length ? past[past.length - 1].from : TARGETS_SINCE;
              const next = line.filter((c) => c.from > d0);
              const editing = edit?.key === f.key;
              return (
                <tr key={f.key} className="border-b border-tan-100 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-navy-900">{f.label} <span className="font-normal text-zinc-500">· {f.per}</span></div>
                    {f.note && <div className="text-[12.5px] text-zinc-500">{f.note}</div>}
                    {line.length > 0 && (
                      <button type="button" onClick={() => setOpen(open === f.key ? null : f.key)} className="mt-1 text-[12.5px] font-semibold text-navy-700 hover:underline">{open === f.key ? 'Hide history' : `History (${line.length})`}</button>
                    )}
                    {open === f.key && (
                      <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] text-zinc-600">
                        <li>{fmtVal(f, DEFAULT_TARGETS[f.key])} · from {fmtDay(TARGETS_SINCE)} · the original target</li>
                        {line.map((c) => (
                          <li key={c.from} className="flex items-center gap-2">
                            <span>{fmtVal(f, c.value)} · from {fmtDay(c.from)} · set by {c.by || '—'}{c.at ? ` on ${new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
                            <button type="button" disabled={busy} onClick={() => submit({ key: f.key, from: c.from, remove: true })} className="text-rose-700 hover:underline">Remove</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-[18px] font-semibold tabular-nums text-navy-800">{fmtVal(f, now[f.key])}</td>
                  <td className="py-3 pr-4 text-zinc-600">{fmtDay(since)}</td>
                  <td className="py-3 pr-4 text-zinc-600">{next.length ? next.map((c) => `${fmtVal(f, c.value)} from ${fmtDay(c.from)}`).join(' · ') : '—'}</td>
                  <td className="py-3">
                    {editing ? (
                      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); submit({ key: f.key, from: edit.from, value: Number(edit.value) }); }}>
                        <label className="text-[12px] text-zinc-600">New target
                          <input autoFocus type="number" min="0" step={f.money ? 500 : 1} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} className={`${inputCls} tabular-nums`} />
                        </label>
                        <label className="text-[12px] text-zinc-600">Takes effect on
                          <input type="date" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} className={inputCls} />
                        </label>
                        <span className="flex gap-2">
                          <button type="submit" disabled={busy || edit.value === '' || !edit.from} className="h-8 px-3 rounded-lg bg-navy-700 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                          <button type="button" onClick={() => setEdit(null)} className="h-8 px-3 rounded-lg border border-zinc-200">Cancel</button>
                        </span>
                      </form>
                    ) : (
                      <button type="button" onClick={() => setEdit({ key: f.key, value: String(now[f.key]), from: d0 })} className="h-8 px-3 rounded-lg border border-tan-300 bg-white font-semibold text-navy-800 hover:bg-tan-50">Change</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[12.5px] text-zinc-500">Pick a Monday for a weekly target and the 1st for a monthly one, so a week or month isn't judged half on each.</p>
      </Section>
    </div>
  );
}
