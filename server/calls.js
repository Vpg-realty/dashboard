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
