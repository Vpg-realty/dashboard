// My Work › Agent Follow-Up › Low-Response Agents (Luke, Nov 8 — owners only;
// moved out of Settings › Backups the same day: "under my work for owners
// only, not hidden away in settings"). The rows come from the deploy's
// agent_lowresp job (server/agentReport.js lowResponseLocation) through
// /api/agent-lists. Nov 9 (Luke: "the filter … doesn't change any of the
// numbers … i can't click into the accounts to view a list of agents"): the
// 4+ … 8+ pick (Nov 9: almost nobody is past 8 — the automation stops) recounts every number (each sub-account's
// `ig` = [ignored, past lead] per agent), and a sub-account opens its agents
// on the right (`?sub=<location>`), with search and its own CSV.
import { useEffect, useMemo, useState } from 'react';
import { loadLowResp, loadLowRespSub, lowRespCsv } from '../utils/dashApi.js';
import { setQuery, useLocation } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import BandMark from '../shell/BandMark.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import SearchBox from '../shell/SearchBox.jsx';

const MINS = [4, 5, 6, 7, 8];
const SHOW = 150;
const num = (n) => (n || 0).toLocaleString('en-US');
const phone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || ''; };
const day = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—');

function countOf(s, min) {
  let agents = 0; let past = 0; let texts = 0;
  for (const [n, p] of s.ig || []) if (n >= min) { agents += 1; past += p; texts += n; }
  return { agents, past, never: agents - past, texts };
}

export default function LowResponse() {
  const { query } = useLocation();
  const pickSub = query.get('sub') || '';
  const min = MINS.includes(Number(query.get('min'))) ? Number(query.get('min')) : 4;
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { loadLowResp().then(setD).catch((e) => setErr(e.message)); }, []);
  const subs = useMemo(() => (d?.subs || []).map((s) => ({ ...s, c: countOf(s, min) })), [d, min]);
  const tot = subs.reduce((t, s) => ({ agents: t.agents + s.c.agents, never: t.never + s.c.never, past: t.past + s.c.past, texts: t.texts + s.c.texts }), { agents: 0, never: 0, past: 0, texts: 0 });
  const shown = subs.filter((s) => s.c.agents > 0).sort((a, b) => b.c.agents - a.c.agents);
  const empty = subs.filter((s) => !s.c.agents);
  const picked = subs.find((s) => s.loc === pickSub) || null;
  const st = d?.status;

  const shell = (b) => <div className="max-w-[1720px] mx-auto w-full flex flex-col gap-4 pb-16">{b}</div>;
  return shell(<>
    <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 shadow-sm">
      <BandMark />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">My Work · Agent Follow-Up · Owners</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">Low-Response Agents</h1>
          <p className="mt-1 text-[13.5px] text-white/75 max-w-3xl">Agents in nurture or engaged who keep getting automated texts and don’t answer. Never a lead and replied once or twice, or a past lead with no lead in 4 months. Parked, DNC and DND contacts are left out. Read from GHL only — nothing is tagged.</p>
        </div>
        {subs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <BandCounter label="Agents" value={num(tot.agents)} hot />
            <BandCounter label="Never a lead" value={num(tot.never)} />
            <BandCounter label="Past leads" value={num(tot.past)} />
            <BandCounter label="Texts ignored" value={num(tot.texts)} />
          </div>
        )}
      </div>
      {subs.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-white/60 font-semibold">Ignored at least</span>
          <div className="inline-flex rounded-lg bg-navy-900/60 p-1 ring-1 ring-white/15">
            {MINS.map((n) => (
              <button key={n} type="button" onClick={() => setQuery({ min: n === 4 ? null : String(n) })}
                className={`h-8 px-3 rounded-md text-[13px] font-semibold ${n === min ? 'bg-tan-500 text-navy-900 shadow-sm' : 'text-white/80 hover:text-white'}`}>{n}+ texts</button>
            ))}
          </div>
          <a href={lowRespCsv(min)} className="ml-auto inline-flex items-center h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/25 text-white text-[13px] font-semibold">Download All · CSV ↓</a>
        </div>
      )}
    </div>

    {err && <p className="text-rose-700 text-[14px]">{err}</p>}
    {!err && !d && <p className="text-zinc-500 text-[14px]">Loading…</p>}
    {d && !subs.length && <Panel title="Being Put Together"><p className="px-6 py-5 text-[14px] text-zinc-600">Each deploy reads a few sub-accounts’ full message history. Check back in a few hours.</p></Panel>}

    {subs.length > 0 && (
      <div className="grid grid-cols-1 xl:grid-cols-[440px_minmax(0,1fr)] gap-4 items-start">
        <Panel title="By Rep · State" right={st?.finished ? 'All sub-accounts read' : `${subs.length} read so far`}>
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-zinc-500 bg-tan-50">
              <th className="px-4 py-2">Rep · State</th><th className="px-2 py-2 text-right">Agents</th><th className="px-2 py-2 text-right">Never a lead</th><th className="px-4 py-2 text-right">Past</th>
            </tr></thead>
            <tbody>
              {shown.map((s) => {
                const on = s.loc === pickSub;
                return (
                  <tr key={s.loc} onClick={() => setQuery({ sub: on ? null : s.loc })}
                    className={`border-t border-tan-100 cursor-pointer ${on ? 'bg-navy-700 text-white' : 'hover:bg-tan-50'}`}>
                    <td className={`px-4 py-2 font-medium ${on ? '' : 'text-navy-800'}`}>{s.label}<span className={`ml-1.5 ${on ? 'text-tan-300' : 'text-zinc-400'}`}>›</span></td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{num(s.c.agents)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(s.c.never)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{num(s.c.past)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-tan-200 font-semibold text-navy-800"><td className="px-4 py-2">Total</td><td className="px-2 py-2 text-right tabular-nums">{num(tot.agents)}</td><td className="px-2 py-2 text-right tabular-nums">{num(tot.never)}</td><td className="px-4 py-2 text-right tabular-nums">{num(tot.past)}</td></tr>
            </tbody>
          </table>
          {empty.length > 0 && <p className="px-4 py-3 text-[12.5px] text-zinc-500 border-t border-tan-100" title={empty.map((s) => s.label).join(', ')}>{empty.length} other sub-accounts have none at {min}+.</p>}
        </Panel>
        {picked ? <Agents key={picked.loc} sub={picked} min={min} /> : (
          <div className="rounded-xl border border-dashed border-tan-300 bg-white/60 px-6 py-10 text-center text-[14px] text-zinc-500">Click a rep · state on the left to see its agents.</div>
        )}
      </div>
    )}
  </>);
}

function Agents({ sub, min }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [kind, setKind] = useState('');
  useEffect(() => { loadLowRespSub(sub.loc).then(setD).catch((e) => setErr(e.message)); }, [sub.loc]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return (d?.agents || [])
      .filter((a) => a.ignored >= min)
      .filter((a) => (kind === 'past' ? a.leads > 0 : kind === 'never' ? !a.leads : true))
      .filter((a) => !t || (a.name || '').toLowerCase().includes(t) || (a.email || '').toLowerCase().includes(t) || (digits.length >= 3 && String(a.phone || '').replace(/\D/g, '').includes(digits)))
      .sort((a, b) => b.ignored - a.ignored);
  }, [d, q, min, kind]);
  const list = all ? rows : rows.slice(0, SHOW);
  const cell = 'px-3 py-2';
  const chip = (id, label, n) => (
    <button type="button" onClick={() => setKind(id)} className={`h-8 px-3 rounded-full text-[13px] font-semibold ring-1 ring-inset ${kind === id ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-200 hover:bg-tan-50'}`}>{label} <span className="opacity-70 tabular-nums">{num(n)}</span></button>
  );
  return (
    <Panel title={`${sub.label} · Agents`} right={<a href={lowRespCsv(min, sub.loc)} className="text-[12.5px] font-semibold">CSV ↓</a>}>
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-tan-100">
        {chip('', 'All', sub.c.agents)}{chip('never', 'Never a lead', sub.c.never)}{chip('past', 'Past leads', sub.c.past)}
        <div className="ml-auto w-full sm:w-72"><SearchBox className="w-full" value={q} onChange={setQ} placeholder="Search name, phone, email" /></div>
      </div>
      {err && <p className="px-4 py-4 text-rose-700 text-[13.5px]">{err}</p>}
      {!err && !d && <p className="px-4 py-4 text-zinc-500 text-[13.5px]">Loading agents…</p>}
      {d && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-zinc-500 bg-tan-50">
              <th className={cell}>Agent</th><th className={cell}>Phone</th><th className={`${cell} text-right`}>Ignored</th><th className={`${cell} whitespace-nowrap`}>Last Reply</th><th className={`${cell} text-right`}>Replies</th><th className={`${cell} whitespace-nowrap`}>Last Auto</th><th className={cell}>Tier</th><th className={cell}>Past Lead</th><th className={cell} />
            </tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-t border-tan-100 hover:bg-tan-50/60">
                  <td className={`${cell} font-semibold text-navy-800`}>{a.name || 'No name in GHL'}<div className="text-[12px] font-normal text-zinc-500 truncate max-w-[200px]">{a.automation}{a.email ? ` · ${a.email}` : ''}</div></td>
                  <td className={`${cell} whitespace-nowrap text-zinc-700`}>{phone(a.phone)}</td>
                  <td className={`${cell} text-right font-semibold tabular-nums ${a.ignored >= 10 ? 'text-rose-700' : 'text-navy-800'}`}>{a.ignored}</td>
                  <td className={`${cell} whitespace-nowrap text-zinc-700`}>{day(a.lastReply)}</td>
                  <td className={`${cell} text-right tabular-nums`}>{a.replies}</td>
                  <td className={`${cell} whitespace-nowrap text-zinc-700`}>{day(a.lastAuto)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{a.tier || '—'}</td>
                  <td className={`${cell} whitespace-nowrap`}>{a.leads ? `${a.leads} · ${day(a.lastLead)}` : '—'}</td>
                  <td className={`${cell} text-right`}><a href={`https://app.gohighlevel.com/v2/location/${sub.loc}/contacts/detail/${a.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center h-8 px-2.5 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-[12.5px] font-semibold whitespace-nowrap">GHL ↗</a></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={9} className="px-4 py-6 text-zinc-500">No agents match.</td></tr>}
            </tbody>
          </table>
          {rows.length > SHOW && !all && <button type="button" onClick={() => setAll(true)} className="w-full py-3 text-[13px] font-semibold text-navy-700 hover:bg-tan-50 border-t border-tan-100">Show all {num(rows.length)}</button>}
        </div>
      )}
    </Panel>
  );
}
