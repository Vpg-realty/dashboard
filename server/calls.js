// Call activity per sub-account (Luke, Oct 8: "how many calls we are taking,
// inbound and outbound"). Source: GHL's message export filtered to the Call
// channel (`GET /conversations/messages/export?channel=Call`), which returns
// one TYPE_CALL message per call through GHL's phone system with `direction`
// (inbound / outbound), `status` / `meta.call.status` (completed, no-answer,
// voicemail, busy, failed …) and `meta.call.duration` (seconds, answered
// calls only). Calls made outside GHL (personal cells, other dialers) are not
// in here. Needs the PIT's conversations/message.readonly scope; a failure is
// reported as pair.callsError and never blanks the rest of the pair.

// Pure: summarise a list of call messages into today / week buckets.
export function summarizeCalls(messages, { todayStartMs, weekStartMs }) {
  const bucket = () => ({ inbound: 0, outbound: 0, connected: 0, talkSec: 0 });
  const out = { today: bucket(), week: bucket() };
  for (const m of messages || []) {
    const t = Date.parse(m?.dateAdded);
    if (!Number.isFinite(t) || t < weekStartMs) continue;
    const dir = m.direction === 'outbound' ? 'outbound' : m.direction === 'inbound' ? 'inbound' : null;
    if (!dir) continue;
    const status = m?.meta?.call?.status || m?.status;
    const secs = Number(m?.meta?.call?.duration) || 0;
    const answered = status === 'completed';
    for (const b of t >= todayStartMs ? [out.today, out.week] : [out.week]) {
      b[dir] += 1;
      if (answered) { b.connected += 1; b.talkSec += secs; }
    }
  }
  return out;
}

// GHL's message export sometimes answers 200 with an empty list for a
// location that does have calls (seen Oct 8: five sub-accounts dropped from
// 3–24 calls this week to 0 between two runs, no error). Call counts only
// ever grow within a period, so each field keeps the higher of this run and
// the previous published run, as long as that run is in the same week (or
// the same day, for `today`). Pure; mutates nothing.
export function keepCallsMonotonic(pairs, prevPairs, { prevGeneratedMs, todayStartMs, weekStartMs }) {
  if (!Array.isArray(prevPairs) || !Number.isFinite(prevGeneratedMs) || prevGeneratedMs < weekStartMs) return pairs;
  const sameDay = prevGeneratedMs >= todayStartMs;
  const prevByKey = new Map(prevPairs.map((p) => [`${p.repId}|${p.marketId}`, p.calls]));
  const maxOf = (a, b) => ({
    inbound: Math.max(a.inbound, b.inbound),
    outbound: Math.max(a.outbound, b.outbound),
    connected: Math.max(a.connected, b.connected),
    talkSec: Math.max(a.talkSec, b.talkSec),
  });
  return pairs.map((p) => {
    const prev = prevByKey.get(`${p.repId}|${p.marketId}`);
    if (!prev?.week) return p;
    // Pull failed outright this run: carry the previous numbers, keep the error.
    const cur = p.calls || { today: { inbound: 0, outbound: 0, connected: 0, talkSec: 0 }, week: { inbound: 0, outbound: 0, connected: 0, talkSec: 0 } };
    const calls = {
      week: maxOf(cur.week, prev.week),
      today: sameDay && prev.today ? maxOf(cur.today, prev.today) : cur.today,
    };
    return { ...p, calls };
  });
}
