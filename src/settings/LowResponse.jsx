// Low-response agents (Luke, Nov 8) on Settings › Backups — owners only. The
// rows come from the deploy's agent_lowresp job (server/agentReport.js
// lowResponseLocation); the download is a CSV from /api/agent-lists.
import { useEffect, useState } from 'react';
import { loadLowResp, lowRespCsv } from '../utils/dashApi.js';
import { Section } from './ui.jsx';
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
  return (
    <Section title="Low-Response Agents" sub="Agents in nurture or engaged who keep getting automated texts and don't answer: 4 or more automated texts since their last reply. Agents who were never a lead and replied once or twice, plus past leads whose last lead is over 4 months old. Parked (do not automate), DNC and DND contacts are left out. Read from GHL only — nothing is tagged.">
      {err && <p className="text-rose-700 text-[13.5px]">{err}</p>}
      {!err && !d && <p className="text-zinc-500 text-[13.5px]">Loading…</p>}
      {d && !subs.length && <p className="text-zinc-500 text-[13.5px]">Being put together — each deploy reads a few sub-accounts' full message history. Check back in a few hours.</p>}
      {subs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-navy-800">
            <span><b className="text-[18px]">{num(tot.rows)}</b> agents</span>
            <span>{num(tot.never)} never a lead · {num(tot.past)} past leads</span>
            <span>{num(tot.sent)} automated texts sent to them since they last answered</span>
            <span className="text-zinc-500">{st?.finished ? 'All sub-accounts read' : `${subs.length} sub-accounts read so far`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchSelect className="w-52" value={min} onChange={(v) => v && setMin(v)} clearable={false} sort={false} options={MINS} />
            <a href={lowRespCsv(min)} className="inline-flex items-center h-9 px-3 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-[13px] font-semibold">Download CSV ↓</a>
          </div>
          <table className="text-[13px] w-full max-w-2xl">
            <thead><tr className="text-left text-zinc-500"><th className="font-medium py-1">Rep · State</th><th className="font-medium text-right">Agents</th><th className="font-medium text-right">Never a lead</th><th className="font-medium text-right">Past leads</th></tr></thead>
            <tbody>{subs.map((s) => <tr key={s.loc} className="border-t border-tan-100"><td className="py-1">{s.label}</td><td className="text-right font-semibold">{num(s.rows)}</td><td className="text-right">{num(s.count?.neverLead)}</td><td className="text-right">{num(s.count?.pastLead)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
