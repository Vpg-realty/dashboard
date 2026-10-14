// What one edit writes (Luke, Oct 14). Most fields are just themselves; a
// few carry another field with them, the same way in the deal panel and in
// the All deals / Active cells:
//   - Retrade → Yes keeps the price as "Original contracted price" and sets
//     the contracted price to 0 until the new one is typed in (retradeFields);
//   - End time: a new "HH:MM" keeps the zone the old text named ("5PM EDT")
//     when no time zone is picked yet.
import { retradeFields, isBlank } from './math.js';
import { parseEndTime } from './ddTime.js';

export function editFields(deal, key, value) {
  if (key === 'retrade') return retradeFields(deal, value);
  if (key === 'ddEndTime' && isBlank(deal?.ddEndTz)) {
    const old = parseEndTime(deal?.ddEndTime, deal?.state);
    if (old.zone) return { ddEndTime: value, ddEndTz: old.zone };
  }
  return { [key]: value };
}
