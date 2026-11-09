// My Work › Agent Follow-Up (Luke, Nov 8 — from the approved mock-up): each
// rep works through their Nov 6 work lists — parked agents to call back, and
// agents who should be Tier 1. Luke, Nov 9: "a super simple process" — each
// agent has three buttons: Open in GHL, then ✓ Complete (or ★ Tag as Tier 1)
// or Ignore; Done keeps an Undo.
// Owners see the team's progress and open any rep's list (read only); a pod
// lead their pod's. Server: functions/api/agent-work.js, edge/agentWork.js.
import { useEffect, useMemo, useState } from 'react';
import { call, useMe } from '../utils/dashApi.js';
import { setQuery, useLocation } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import BandMark from '../shell/BandMark.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';
import MarketChips from '../shell/MarketChips.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { ALL_REPS } from '../data/config.js';

const api = (q, body) => call(`agent-work${q ? `?${q}` : ''}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
// Older answers (Nov 8 – 9) still read as done.
const DONE = new Set(['complete', 'ignore', 'tier1', 'working', 'skip', 'unreached', 'keep', 'notfit']);
const MAIN = { parked: ['complete', '✓ Complete'], tier1: ['tier1', '★ Tag as Tier 1'] };
const WORD = { complete: 'Completed', working: 'Completed', unreached: 'Completed', tier1: 'Tagged Tier 1', ignore: 'Ignored', skip: 'Ignored', keep: 'Ignored', notfit: 'Ignored' };
const isIgnored = (o) => WORD[o] === 'Ignored';
const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const phone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || ''; };
const day = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null);
const ago = (iso) => { if (!iso) return 'not started'; const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
const colorOf = (id) => ALL_REPS.find((r) => r.id === id)?.color || '#1b385f';

// Why they're on the list, in plain words.
function why(r) {
  const bits = [];
  if (r.closed) bits.push(<b key="c" className="text-navy-800">Closed {r.closed === 1 ? 'a deal' : `${r.closed} deals`} with us{r.closedValue ? ` (${money(r.closedValue)})` : ''}</b>);
  else if (r.contracted) bits.push(<b key="k" className="text-navy-800">Went under contract with us{r.contracted > 1 ? ` ${r.contracted}×` : ''}</b>);
  else if (r.leads) bits.push(<b key="l" className="text-navy-800">{r.leads === 1 ? 'Sent us a lead' : `Sent us ${r.leads} leads`}</b>);
  if (r.replies) bits.push(`${r.replies} replies`);
  if (r.list === 'parked') bits.push(r.quiet != null ? `we last reached out ${r.quiet} days ago` : 'no text or call from us since May');
  else if (r.tier) bits.push(`tagged ${r.tier} now`);
  else bits.push('no tier tag');
  return bits.flatMap((b, i) => (i ? [' · ', b] : [b]));
}

export default function AgentFollowUp() {
  const me = useMe();
  const { query } = useLocation();
  const rep = query.get('rep') || '';
  const view = query.get('view') || '';
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [st, setSt] = useState(null);
  useEffect(() => {
    let live = true;
    api(rep ? `rep=${encodeURIComponent(rep)}` : '').then((r) => { if (live) { setD(r); setErr(null); } }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [rep]);

  const rows = useMemo(() => d?.rows || [], [d]);
  const key = (r) => `${r.loc}|${r.list}|${r.contact}`;
  const open = (list) => rows.filter((r) => r.list === list && !DONE.has(r.outcome));
  const done = rows.filter((r) => DONE.has(r.outcome));
  const progressFirst = !!d?.progress && (!d.rep || view === 'team');
  const pick = progressFirst ? 'team' : view || 'parked';
  const shown = pick === 'done' ? done : pick === 'tier1' ? open('tier1') : open('parked');
  const states = [...new Set(rows.map((r) => d.markets[r.loc]).filter(Boolean))];
  const list = st ? shown.filter((r) => d.markets[r.loc] === st) : shown;
  const monday = useMemo(() => { const n = new Date(); const az = new Date(n.getTime() - 7 * 3600000); const dow = (az.getUTCDay() + 6) % 7; return new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate() - dow, 7)).toISOString(); }, []);
  const week = rows.filter((r) => r.at && r.at >= monday && DONE.has(r.outcome)).length;

  async function act(r, action, outcome) {
    setBusy(key(r)); setErr(null);
    try {
      const res = await api('', { action, loc: r.loc, list: r.list, contact: r.contact, outcome });
      setD(res);
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  }

  const shell = (b) => <div className="max-w-[1720px] mx-auto w-full flex flex-col gap-4 pb-16">{b}</div>;
  if (!d) return shell(err ? <p className="text-rose-700 text-[14px]">{err}</p> : <p className="text-zinc-500 text-[14px]">Loading…</p>);

  const parkedAll = rows.filter((r) => r.list === 'parked');
  const viewing = d.reps?.length > 0;
  const title = progressFirst ? 'Agent Follow-Up' : d.mine ? 'My Agent List' : `${(d.repName || '').split(' ')[0]}’s Agent List`;

  return shell(<>
    <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 shadow-sm">
      <BandMark />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">My Work · Agent Follow-Up</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13.5px] text-white/75 max-w-3xl">
            {progressFirst ? 'How each rep is doing on their call-back and Tier 1 lists. Pick a rep to see their list.' : 'Agents who’ve worked with us and gone quiet, best first. About 10 a day clears the call-back list in two weeks.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {viewing && (
            <label className="grid gap-1">
              <span className="text-[11px] uppercase tracking-wide text-white/60 font-semibold">Viewing</span>
              <SearchSelect className="w-56" value={progressFirst ? 'team' : d.rep || 'team'} clearable={false} sort={false}
                onChange={(v) => v && (v === 'team' ? setQuery({ rep: null, view: d.rep && d.mine ? 'team' : null }) : setQuery({ rep: v === me?.rep_id ? null : v, view: null }))}
                options={[{ value: 'team', label: me?.role === 'owner' ? 'Team progress' : 'Pod progress' }, ...d.reps.map((p) => ({ value: p.repId, label: p.repId === me?.rep_id ? `${p.name} (me)` : p.name }))]}
                buttonClass="h-9 rounded-lg bg-white/10 text-white ring-1 ring-white/25 px-3 text-[13.5px] font-semibold" />
            </label>
          )}
          {!progressFirst && <>
            <BandCounter label="Call back" value={open('parked').length} hot />
            <BandCounter label="Tier 1?" value={open('tier1').length} />
            <BandCounter label="Done this week" value={week} />
          </>}
        </div>
      </div>
    </div>
    {err && <p className="text-rose-700 text-[14px]">{err}</p>}

    {progressFirst ? <Progress rows={d.progress} /> : !rows.length ? (
      <Panel title="Nothing on the List"><p className="px-6 py-5 text-[14px] text-zinc-600">{d.rep ? 'No agents on this list from the Nov 6 report.' : 'Agent Follow-Up lists belong to reps — this account has no sub-accounts.'}</p></Panel>
    ) : (
      <div className={RAIL_GRID}>
        <SideRail label="Lists" value={pick} onPick={(id) => setQuery({ view: id === 'parked' ? null : id })}
          groups={[{ title: 'To Work', items: [
            { id: 'parked', label: 'Call Back · Parked', sub: 'Worked with us, gone quiet', count: open('parked').length },
            { id: 'tier1', label: 'Make Tier 1?', sub: 'Acting like Tier 1 without the tag', count: open('tier1').length },
          ] }, { title: 'Finished', items: [{ id: 'done', label: 'Done', sub: 'Checked off', count: done.length }] }]} />
        <div className="flex flex-col gap-3 min-w-0">
          {pick !== 'done' && (() => {
            const all = pick === 'tier1' ? rows.filter((r) => r.list === 'tier1') : parkedAll;
            const n = all.filter((r) => DONE.has(r.outcome)).length;
            return (
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-zinc-600">
                <span className="tabular-nums">{n} of {all.length} done</span>
                <span className="flex-1 min-w-[160px] h-2 rounded-full bg-tan-100 overflow-hidden"><span className="block h-full bg-emerald-600" style={{ width: `${all.length ? (n / all.length) * 100 : 0}%` }} /></span>
              </div>
            );
          })()}
          {states.length > 1 && <MarketChips value={st} onChange={setSt} options={states.map((s) => ({ id: s, label: s, count: shown.filter((r) => d.markets[r.loc] === s).length }))} />}
          {!list.length && <div className="rounded-xl border border-tan-200 bg-white px-5 py-6 text-[14px] text-zinc-600">{pick === 'done' ? 'Nothing checked off yet.' : '✓ All done on this list.'}</div>}
          {list.map((r) => <AgentRow key={key(r)} r={r} st={d.markets[r.loc]} canEdit={d.mine} busy={busy === key(r)} act={(a, o) => act(r, a, o)} />)}
          <p className="text-[12.5px] text-zinc-500 pt-2">Open the agent in GHL, reach out there, then come back and tap <b>Complete</b> — or <b>Ignore</b> to take them off your list. <b>Tag as Tier 1</b> puts the “tier 1” tag on in GHL and takes the old tier tag off with the next refresh (about 15 minutes). Anything can be undone from Done. From the Nov 6 report (texts and calls since May 5, every opportunity on file).</p>
        </div>
      </div>
    )}
  </>);
}

function AgentRow({ r, st, canEdit, busy, act }) {
  const finished = DONE.has(r.outcome);
  const copy = (t) => { try { navigator.clipboard?.writeText(t); } catch { /* ignore */ } };
  const ghl = `https://app.gohighlevel.com/v2/location/${r.loc}/contacts/detail/${r.contact}`;
  const [main, mainLabel] = MAIN[r.list];
  const btn = 'h-9 px-3.5 rounded-lg text-[13.5px] font-semibold inline-flex items-center disabled:opacity-50';
  return (
    <div className={`rounded-xl border border-tan-200 bg-white px-4 py-3 flex flex-col md:flex-row md:items-center gap-x-4 gap-y-2 ${finished ? 'opacity-75' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-semibold text-navy-800">{r.name || 'No name in GHL'}</span>
          <span className="text-[12.5px] text-zinc-500">{st}{r.tier && r.tier !== 'no tier' ? ` · ${r.tier}` : ''}</span>
          {r.phone && <button type="button" onClick={() => copy(r.phone)} className="text-[12.5px] text-zinc-500 hover:text-navy-700" title="Copy the number">{phone(r.phone)}</button>}
        </div>
        <div className="text-[13.5px] text-zinc-700">{why(r)}</div>
        {(r.lastIn || r.lastLead) && <div className="text-[12.5px] text-zinc-500">{r.lastIn ? `Last reply ${day(r.lastIn)}` : ''}{r.lastIn && r.lastLead ? ' · ' : ''}{r.lastLead ? `last lead ${day(r.lastLead)}` : ''}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <a href={ghl} target="_blank" rel="noopener noreferrer" className={`${btn} bg-navy-700 text-white hover:bg-navy-800`}>Open in GHL ↗</a>
        {finished ? (
          <>
            <span className={`${btn} ring-1 ring-inset ${isIgnored(r.outcome) ? 'bg-zinc-50 text-zinc-600 ring-zinc-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'}`}>{isIgnored(r.outcome) ? '' : '✓ '}{WORD[r.outcome]}{r.at ? ` · ${day(r.at)}` : ''}{r.by && !canEdit ? ` · ${r.by}` : ''}</span>
            {canEdit && <button type="button" disabled={busy} onClick={() => act('undo')} className={`${btn} text-zinc-600 hover:bg-zinc-50 ring-1 ring-inset ring-zinc-200`}>Undo</button>}
          </>
        ) : canEdit ? (
          <>
            <button type="button" disabled={busy} onClick={() => act('mark', main)} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>{mainLabel}</button>
            <button type="button" disabled={busy} onClick={() => act('mark', 'ignore')} className={`${btn} bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50`}>Ignore</button>
          </>
        ) : <span className="text-[12.5px] text-zinc-400">Not checked off yet</span>}
      </div>
    </div>
  );
}

function Progress({ rows }) {
  if (!rows?.length) return <Panel title="Progress"><p className="px-6 py-5 text-[14px] text-zinc-600">No lists yet.</p></Panel>;
  const cell = 'px-4 py-2.5';
  const bar = (g) => (
    <div className="flex items-center gap-2 min-w-[150px]">
      <span className="flex-1 h-2 rounded-full bg-tan-100 overflow-hidden"><span className="block h-full bg-emerald-600" style={{ width: `${g.total ? (g.done / g.total) * 100 : 0}%` }} /></span>
      <span className="tabular-nums text-[13px] text-zinc-700 w-16 text-right">{g.done} / {g.total}</span>
    </div>
  );
  return (
    <Panel title="Progress by Rep">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead><tr className="text-left text-[12px] uppercase tracking-wide text-zinc-500 bg-tan-50">
            <th className={cell}>Rep</th><th className={cell}>Call Back · Parked</th><th className={cell}>Make Tier 1?</th><th className={cell}>Made Tier 1</th><th className={cell}>This Week</th><th className={cell}>Last Checked Off</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.repId} className="border-t border-tan-100 hover:bg-tan-50/60 cursor-pointer" onClick={() => setQuery({ rep: p.repId, view: null })}>
                <td className={`${cell} font-semibold text-navy-800 whitespace-nowrap`}><span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: colorOf(p.repId) }} />{p.name}</td>
                <td className={cell}>{bar(p.parked)}</td>
                <td className={cell}>{bar(p.tier1)}</td>
                <td className={`${cell} tabular-nums`}>{p.tier1Made}</td>
                <td className={`${cell} tabular-nums`}>{p.week}</td>
                <td className={`${cell} text-zinc-600 whitespace-nowrap`}>{ago(p.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
