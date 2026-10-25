// What a cancel saves (CancelDialog.jsx, Luke Oct 25).
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();
// VPG put money in when EMD paid by is VPG or VPG + Buyer.
export const vpgPlaced = (d) => ['VPG', 'VPG + BUYER'].includes(up(d?.emdPaidBy));

// The fields a confirmed cancel writes (only the ones that change).
export function cancelFields(d, a) {
  const out = { status: 'CANCELLED', cancelReason: a.reason, cancelAs: a.ghl };
  if (a.our === 'LOST') {
    out.emdReturned = 'LOST';
    out.emdLostWhy = a.reason === 'BUYER_DEFAULT' ? 'BUYER_DEFAULT' : (d.emdLostWhy || 'PAST_IP');
  } else if (a.our === 'NONE') {
    out.emdReturned = 'NA';
    if (d.emdLostWhy != null) out.emdLostWhy = null;
  } else {
    // Coming back: it isn't back yet — Finance › Earnest Money lists it until it's marked Yes.
    if (['LOST', 'NA', 'NO'].includes(up(d.emdReturned))) out.emdReturned = null;
    if (d.emdLostWhy != null) out.emdLostWhy = null;
  }
  const kept = a.reason === 'BUYER_DEFAULT' && a.keep ? num(a.kept) : 0;
  if (kept > 0) out.emdKept = kept;
  else if (d.emdKept != null) out.emdKept = null;
  return out;
}

