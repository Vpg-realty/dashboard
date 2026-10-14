// Small chips for a state's status and season (src/territory/status.js).
import { STATUS_LOOK, SEASON_LOOK, statusOf, seasonOf, chipCls } from './status.js';

export const StatusChip = ({ st }) => { const s = statusOf(st); return <span className={`${chipCls} ${STATUS_LOOK[s].chip}`} title={STATUS_LOOK[s].hint}>{s}</span>; };
export const SeasonChip = ({ st, compact }) => {
  const k = seasonOf(st);
  const l = SEASON_LOOK[k];
  return <span className={`${chipCls} ${l.chip}`} title={l.hint}>{l.icon && <span aria-hidden="true">{l.icon}</span>}{compact ? l.short : l.label}</span>;
};
export const SeasonIcon = ({ st }) => { const k = seasonOf(st); return k === 'none' ? null : <span title={SEASON_LOOK[k].label} className={`${SEASON_LOOK[k].text} text-[12px]`}>{SEASON_LOOK[k].icon}</span>; };
