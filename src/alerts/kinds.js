// Shared by the Alerts page and Home's Today at a Glance: the lead type
// colours (Luke, Oct 22) and where an alert opens in GHL.
import { ghlContactUrl, ghlConvUrl, ghlOppUrl } from '../data/config.js';

export const LEAD_TYPE = {
  hot: { label: 'Hot lead', on: 'bg-red-600 text-white', row: 'border-l-red-600 bg-red-50/60', chip: 'bg-red-100 text-red-800' },
  warm: { label: 'Warm lead', on: 'bg-orange-500 text-white', row: 'border-l-orange-500 bg-orange-50/60', chip: 'bg-orange-100 text-orange-800' },
  cold: { label: 'Cold lead', on: 'bg-sky-600 text-white', row: 'border-l-sky-600 bg-sky-50/60', chip: 'bg-sky-100 text-sky-800' },
  wholesale: { label: 'Wholesale', on: 'bg-teal-600 text-white', row: 'border-l-teal-600 bg-teal-50/60', chip: 'bg-teal-100 text-teal-800' },
  not: { label: 'Not a lead', on: 'bg-zinc-600 text-white', row: 'border-l-zinc-400 bg-zinc-50', chip: 'bg-zinc-100 text-zinc-700' },
  real: { label: 'Lead', on: 'bg-violet-600 text-white', row: 'border-l-violet-500', chip: 'bg-violet-100 text-violet-800' },
};
export const HINT_WORD = { hot: 'hot lead', warm: 'warm lead', cold: 'cold lead', wholesale: 'potential wholesale', not: 'maybe not a lead' };

export function linkOf(a) {
  if (a.kind === 'lead') return ghlConvUrl(a.sub, a.conv) || ghlContactUrl(a.sub, a.contact);
  // Check-ins open the agent's conversation (the contact page), not the
  // opportunity (Luke, Oct 22).
  if (a.kind === 'checkin') return ghlContactUrl(a.sub, a.contact) || ghlOppUrl(a.sub, a.opp);
  if (a.kind === 'ghl') return ghlContactUrl(a.sub, a.contact);
  return null;
}
