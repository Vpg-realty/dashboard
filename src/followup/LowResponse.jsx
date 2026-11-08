// My Work › Agent Follow-Up › Low-Response Agents (Luke, Nov 8 — owners only;
// moved out of Settings › Backups the same day: "under my work for owners
// only, not hidden away in settings"). The rows come from the deploy's
// agent_lowresp job (server/agentReport.js lowResponseLocation); the download
// is a CSV from /api/agent-lists.
import { useEffect, useState } from 'react';
import { loadLowResp, lowRespCsv } from '../utils/dashApi.js';
import Panel from '../shell/Panel.jsx';
import BandMark from '../shell/BandMark.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';

const MINS = [4, 6, 8, 10, 15].map((n) => ({ value: String(n), label: `${n}+ texts ignored` }));
const num = (n) => (n || 0).toLocaleString('en-US');

export default function LowResponse() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [min, setMin] = useState('4');
  useEffect(() => { loadLowResp().then(setD).catch((e) => setErr(e.message)); }, []);
  const subs = d?.subs || [];
  const tot = subs.reduce((t, s) => ({ rows: t.rows + (s.rows || 0), never: t.never + (s.count?.neverLead || 0), past: t.past + (s.count?.pastLead || 0), sent: t.sent + (s.count?.ignoredSent || 0) }), { rows: 0, never: 0, past: 0, sent: 0 });
  const st = d?.status;
  const shell = (b) => <div className="max-w-[1720px] mx-auto w-full flex flex-col gap-4 pb-16">{b}</div>;
  return shell(<>
    <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 shadow-sm">
      <BandMark />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">My Work · Agent Follow-Up · Owners</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">Low-Response Agents</h1>
          <p className="mt-1 text-[13.5px] text-white/75 max-w-3xl">Agents in nurture or engaged who keep getting automated texts and don’t answer: 4 or more since their last reply. Never a lead and replied once or twice, or a past lead with no lead in 4 months. Parked, DNC and DND contacts are left out. Read from GHL only — nothing is tagged.</p>
        </div>
        {subs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <BandCounter label="Agents" value={num(tot.rows)} hot />
            <BandCounter label="Never a lead" value={num(tot.never)} />
            <BandCounter label="Past leads" value={num(tot.past)} />
            <BandCounter label="Texts since last reply" value={num(tot.sent)} />
          </div>
        )}
      </div>
    </div>
    <Panel title="By Rep · State" right={subs.length ? (st?.finished ? 'All sub-accounts read' : `${subs.length} sub-accounts read so far`) : null}>
      <div className="px-6 py-5">
      {err && <p className="text-rose-700 text-[13.5px]">{err}</p>}
      {!err && !d && <p className="text-zinc-500 text-[13.5px]">Loading…</p>}
      {d && !subs.length && <p className="text-zinc-500 text-[13.5px]">Being put together — each deploy reads a few sub-accounts' full message history. Check back in a few hours.</p>}
      {subs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchSelect className="w-52" value={min} onChange={(v) => v && setMin(v)} clearable={false} sort={false} options={MINS} />
            <a href={lowRespCsv(min)} className="inline-flex items-center h-9 px-3 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-[13px] font-semibold">Download CSV ↓</a>
          </div>
          <table className="text-[13.5px] w-full max-w-2xl">
            <thead><tr className="text-left text-zinc-500"><th className="font-medium py-1">Rep · State</th><th className="font-medium text-right">Agents</th><th className="font-medium text-right">Never a lead</th><th className="font-medium text-right">Past leads</th></tr></thead>
            <tbody>{subs.map((s) => <tr key={s.loc} className="border-t border-tan-100"><td className="py-1.5">{s.label}</td><td className="text-right font-semibold">{num(s.rows)}</td><td className="text-right">{num(s.count?.neverLead)}</td><td className="text-right">{num(s.count?.pastLead)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      </div>
    </Panel>
  </>);
}
