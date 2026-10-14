// Deals › Active (Luke, Oct 14; the sheet's "Pipeline" tab): every PENDING
// deal with its next step, in two lists — assigned and headed to close, and
// still needing a buyer. Next-step rules are the sheet's, in its order.
// Under them, deals GoHighLevel has under contract that aren't in the
// tracker yet, one click to add (fields filled from GHL).
import { useMemo, useState } from 'react';
import { useDeals, ghlDeals, addrKey, fieldsFromGhl, GHL_STAGE } from './store.js';
import { PageHead, Tile, Tiles, Loading, Search } from './ui.jsx';
import { money, compact, shortDate, firstName, stateCode, btnCls, primaryCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import { laToday } from '../utils/historyRange.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function nextStep(d, today) {
  const toCoe = ISO.test(d.coe || '') ? days(today, d.coe) : null;
  const toDd = ISO.test(d.ddEnd || '') ? days(today, d.ddEnd) : null;
  const assigned = typeof d.grossAssign === 'number' && d.grossAssign >= 0;
  if (toCoe != null && toCoe < 0) return { text: `Past COE by ${-toCoe}d — update status`, tone: 'red' };
  if (d.emdStatus === 'PENDING' && !d.emdPaidBy) return { text: 'EMD pending — no payer listed', tone: 'amber' };
  if (d.emdStatus === 'COMPLETE' && d.emdPaidBy === 'VPG') return { text: 'EMD at risk — VPG only', tone: 'amber' };
  if (!assigned && toDd != null && toDd >= 0 && toDd <= 3) return { text: `DD ends in ${toDd}d — assign or extend`, tone: 'red' };
  if (!assigned && toDd != null && toDd < 0) return { text: 'Find buyer — DD expired', tone: 'red' };
  if (!assigned) return { text: 'Find buyer', tone: 'zinc' };
  if (toCoe == null) return { text: 'Set COE date', tone: 'amber' };
  if (toCoe === 0) return { text: 'Closing today — confirm title', tone: 'blue' };
  if (toCoe <= 7) return { text: `Closing in ${toCoe}d — confirm title`, tone: 'blue' };
  return { text: 'On track', tone: 'green' };
}
const TONE = { red: 'text-red-700', amber: 'text-amber-700', blue: 'text-blue-700', green: 'text-emerald-700', zinc: 'text-zinc-600' };
const firstLine = (s) => (s ? String(s).split('\n')[0].trim() : '—');
const street = (a) => String(a || '').split(',')[0];

function Table({ title, sub, rows, cols, onOpen, empty }) {
  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
      <div className="flex items-baseline gap-2 px-4 py-3 border-b border-zinc-100">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-zinc-500">{sub}</span>
      </div>
      {rows.length === 0 ? <div className="px-4 py-6 text-zinc-500">{empty}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[11.5px] text-zinc-500">
              <tr>{cols.map((c) => <th key={c.label} className={`px-3 py-2 font-medium whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} onClick={() => onOpen(d.id)} className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                  {cols.map((c) => <td key={c.label} className={`px-3 py-2 whitespace-nowrap ${c.right ? 'text-right tabular-nums' : ''} ${c.cls || ''}`}>{c.get(d)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ActiveView() {
  const s = useDeals();
  const { open, openNew, panel } = useDealPanel();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(null);
  const today = laToday();

  const { assigned, needs, tiles, missing } = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (d) => !words.length || words.every((w) => `${d.address} ${d.acq} ${d.dispoMember} ${d.buyer} ${d.title} ${d.state}`.toLowerCase().includes(w));
    const act = s.deals.filter((d) => d.status === 'PENDING').map((d) => ({ ...d, step: nextStep(d, today) }));
    const isAsg = (d) => typeof d.grossAssign === 'number' && d.grossAssign >= 0;
    const emdRisk = (d) => (d.emdStatus === 'PENDING' && !d.emdPaidBy) || (d.emdStatus === 'COMPLETE' && d.emdPaidBy === 'VPG');
    const pastCoe = (d) => ISO.test(d.coe || '') && d.coe < today;
    const soon = (d) => ISO.test(d.coe || '') && d.coe >= today && days(today, d.coe) <= 7;
    const filters = { emd: emdRisk, past: pastCoe, soon };
    const shown = act.filter(match).filter((d) => !only || filters[only](d));
    const byCoe = (a, b) => (ISO.test(a.coe || '') ? a.coe : '9999') < (ISO.test(b.coe || '') ? b.coe : '9999') ? -1 : 1;
    const asg = act.filter(isAsg);
    // GHL deals not in the tracker yet (pending in GHL = before Closed).
    const have = new Set(s.deals.map((d) => addrKey(d.address)));
    const miss = [...ghlDeals().values()].filter((g) => g.stage !== 'closed' && !have.has(addrKey(g.address || g.name)));
    return {
      assigned: shown.filter(isAsg).sort(byCoe),
      needs: shown.filter((d) => !isAsg(d)).sort(byCoe),
      missing: miss,
      tiles: {
        active: act.length, assigned: asg.length, assignedGross: asg.reduce((t, d) => t + d.grossAssign, 0),
        needs: act.length - asg.length, emd: act.filter(emdRisk).length, past: act.filter(pastCoe).length, soon: act.filter(soon).length,
      },
    };
  }, [s.deals, q, only, today]);

  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const tog = (k) => setOnly((o) => (o === k ? null : k));
  const step = { label: 'Next step', get: (d) => <span className={`font-medium ${TONE[d.step.tone]}`}>{d.step.text}</span> };
  const prop = { label: 'Property', get: (d) => <span className="font-medium text-zinc-900">{street(d.address)}</span>, cls: 'max-w-[220px] truncate' };
  const st = { label: 'St', get: (d) => stateCode(d.state) };
  const coe = { label: 'COE', get: (d) => shortDate(d.coe) };
  const inD = { label: 'In', right: true, get: (d) => (ISO.test(d.coe || '') ? `${days(today, d.coe)}d` : '—') };
  const emd = { label: 'EMD', get: (d) => (d.emdStatus === 'COMPLETE' ? (d.emdPaidBy === 'VPG' ? 'VPG only' : '✓') : d.emdStatus === 'PENDING' ? (d.emdPaidBy ? `Pending · ${d.emdPaidBy}` : 'Pending') : '—') };
  const contract = { label: 'Contract', right: true, get: (d) => money(d.price) };
  const titleCo = { label: 'Title co.', get: (d) => firstLine(d.title), cls: 'max-w-[180px] truncate text-zinc-600' };

  return (
    <div className="max-w-[1400px]">
      <PageHead title="Active deals" sub="Everything pending, with the next step. Click a deal to open it." right={<>
        <Search value={q} onChange={setQ} />
        <button onClick={() => openNew({ status: 'PENDING', dealType: 'WHOLESALE', dispoTeam: 'PENDING', emdStatus: 'PENDING' })} className={primaryCls}>+ New deal</button>
      </>} />
      <Tiles cols={6}>
        <Tile label="Active deals" value={tiles.active} onClick={() => setOnly(null)} active={!only} />
        <Tile label="Assigned" value={tiles.assigned} sub={`${compact(tiles.assignedGross)} gross`} />
        <Tile label="Needs a buyer" value={tiles.needs} />
        <Tile label="EMD at risk" value={tiles.emd} tone={tiles.emd ? 'text-amber-700' : ''} onClick={() => tog('emd')} active={only === 'emd'} />
        <Tile label="Past COE" value={tiles.past} tone={tiles.past ? 'text-red-700' : ''} onClick={() => tog('past')} active={only === 'past'} />
        <Tile label="Closing ≤ 7 days" value={tiles.soon} onClick={() => tog('soon')} active={only === 'soon'} />
      </Tiles>
      {only && <div className="mt-3 text-zinc-500">Showing only: {{ emd: 'EMD at risk', past: 'past COE', soon: 'closing within 7 days' }[only]} · <button onClick={() => setOnly(null)} className="text-blue-600 hover:underline">show all</button></div>}
      <div className="mt-5 flex flex-col gap-5">
        <Table title="Assigned — headed to close" sub={`${assigned.length} deals · ${money(assigned.reduce((t, d) => t + d.grossAssign, 0))} gross assignment`} rows={assigned} onOpen={open} empty="No assigned deals."
          cols={[step, prop, { label: 'Acq → Dispo', get: (d) => `${firstName(d.acq)} → ${d.dispoMember ? firstName(d.dispoMember) : '—'}` }, st, coe, inD, emd,
            { label: 'Gross', right: true, get: (d) => money(d.grossAssign) }, { label: 'Buyer', get: (d) => firstLine(d.buyer), cls: 'max-w-[160px] truncate text-zinc-600' }, titleCo, contract]} />
        <Table title="Needs a buyer — in due diligence" sub={`${needs.length} deals · not yet assigned`} rows={needs} onOpen={open} empty="Every pending deal has a buyer."
          cols={[step, prop, { label: 'Acq. manager', get: (d) => d.acq || '—' }, st, coe, inD, emd, { label: 'DD ends', get: (d) => shortDate(d.ddEnd) },
            { label: 'Dispo team', get: (d) => d.dispoTeam || '—' }, titleCo, contract]} />
        {missing.length > 0 && (
          <section className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-violet-100">
              <h2 className="font-semibold text-violet-950">In GoHighLevel, not in the tracker yet</h2>
              <div className="text-violet-900/70 text-[12.5px] mt-0.5">Under contract or later in GHL, with no tracker deal at the same address. Add one and its address, rep, state, COE and contract date are filled in for you.</div>
            </div>
            <ul className="divide-y divide-violet-100">
              {missing.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <span className="font-medium min-w-0 flex-1 truncate">{g.address || g.name}</span>
                  <span className="text-zinc-600">{g.repName} · {g.marketId}</span>
                  <span className="text-zinc-600">{GHL_STAGE[g.stage]}</span>
                  <span className="text-zinc-500 w-28">COE {shortDate(g.coe)}</span>
                  <button onClick={() => openNew(fieldsFromGhl(g))} className={btnCls}>Add to tracker</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {panel}
    </div>
  );
}
