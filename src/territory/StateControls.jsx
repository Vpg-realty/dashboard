// Owners set a state's market status and season risk (Luke, Oct 14), from the
// map's state panel or the territory sheet. Saved through /api/zips 'area'
// (edge/zips.js setAreaStatus) so zip requests follow at once.
import { useState } from 'react';
import { zipAction } from '../zips/store.js';
import { reloadTerritory } from './store.js';
import { MARKET_STATUSES, STATUS_LOOK, SEASONS, SEASON_LOOK, statusOf, seasonOf } from './status.js';

const SEL = 'h-8 rounded-lg border bg-white px-2 text-[13px] font-medium';

export default function StateControls({ st }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async (body) => { setBusy(true); setErr(null); try { await zipAction('area', { state: st.state, ...body }); await reloadTerritory(st.state); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const status = statusOf(st);
  const season = seasonOf(st);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-500">Status
        <select value={status} disabled={busy} onChange={(e) => save({ market: e.target.value })} className={`${SEL} ${STATUS_LOOK[status].chip}`} title={STATUS_LOOK[status].hint}>
          {MARKET_STATUSES.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <label className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-500">Season risk
        <select value={season} disabled={busy} onChange={(e) => save({ season: e.target.value })} className={`${SEL} border-zinc-200`}>
          {SEASONS.map((k) => <option key={k} value={k}>{SEASON_LOOK[k].icon ? `${SEASON_LOOK[k].icon} ` : ''}{SEASON_LOOK[k].label}</option>)}
        </select>
      </label>
      {err && <span className="text-[12px] text-red-700">{err}</span>}
    </div>
  );
}
