// Period · date-by · compare-to pickers, kept in the page link
// (?p=m:2026-10&by=coe&cmp=prev) so a view can be bookmarked or shared.
import { useState } from 'react';
import { setQuery } from '../shell/router.js';
import { periodChoices, usePeriod, DATE_BY } from './period.js';
import { selectCls } from './format.js';
import { laToday } from '../utils/historyRange.js';

export default function PeriodBar({ deals, defaultKey, showCompare = true, showBy = true }) {
  const { period, by, cmpKey, compare } = usePeriod(defaultKey);
  const ch = periodChoices(deals.flatMap((d) => [d.coe, d.accepted]));
  const custom = period.key.startsWith('r:');
  const [range, setRange] = useState(() => (custom ? [period.from, period.to] : [`${laToday().slice(0, 7)}-01`, laToday()]));
  const known = new Set([...ch.quick, ...ch.months, ...ch.years].map(([k]) => k));
  const pick = (v) => {
    if (v === 'custom') { setQuery({ p: `r:${range[0]}..${range[1]}` }); return; }
    setQuery({ p: v });
  };
  const setR = (i, v) => {
    const r = [...range]; r[i] = v; setRange(r);
    if (r[0] && r[1] && r[0] <= r[1]) setQuery({ p: `r:${r[0]}..${r[1]}` });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={custom ? 'custom' : known.has(period.key) ? period.key : period.key} onChange={(e) => pick(e.target.value)} className={`${selectCls} font-medium`} aria-label="Period">
        <optgroup label="Quick">{ch.quick.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
        <option value="custom">Custom range…</option>
        {!known.has(period.key) && !custom && <option value={period.key}>{period.label}</option>}
        <optgroup label="Months">{ch.months.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
        <optgroup label="Years">{ch.years.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
      </select>
      {custom && (
        <span className="flex items-center gap-1.5">
          <input type="date" value={range[0]} max={range[1]} onChange={(e) => setR(0, e.target.value)} className={selectCls} aria-label="From" />
          <span className="text-zinc-400">to</span>
          <input type="date" value={range[1]} min={range[0]} onChange={(e) => setR(1, e.target.value)} className={selectCls} aria-label="To" />
        </span>
      )}
      {showBy && (
        <select value={by} onChange={(e) => setQuery({ by: e.target.value === 'coe' ? null : e.target.value })} className={selectCls} aria-label="Date by">
          {Object.entries(DATE_BY).map(([k, l]) => <option key={k} value={k}>by {l}</option>)}
        </select>
      )}
      {showCompare && period.from && (
        <select value={cmpKey || ''} onChange={(e) => setQuery({ cmp: e.target.value || null })} className={selectCls} aria-label="Compare to">
          <option value="">No comparison</option>
          <option value="prev">vs previous period</option>
          <option value="yoy">vs same period last year</option>
        </select>
      )}
      {compare && <span className="text-xs text-zinc-500">Comparing with {compare.label}</span>}
    </div>
  );
}
