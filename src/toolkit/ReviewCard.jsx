// "Your Read" + Claude's review under a calculator (Luke, Oct 22: "a quick
// claude review of the underwriting … I still want them to have to think for
// themselves"). The rep's own call (Go / Adjust / Pass) and why is
// encouraged, not required; Claude answers it with questions to check,
// numbers that look off and one or two levers (edge/calcChat.js). Works on
// drafts; saving the calculation keeps both, so pod leads and owners see
// them. When the numbers change after a review, it says so.
import { useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { call } from '../utils/dashApi.js';
import { numbersSig } from './calc.js';

const CALLS = [['go', 'Go'], ['adjust', 'Adjust the terms'], ['pass', 'Pass']];
const VERDICT = {
  strong: ['Strong', 'bg-emerald-50 text-emerald-800 ring-emerald-200'],
  workable: ['Workable', 'bg-sky-50 text-sky-800 ring-sky-200'],
  stretch: ['Stretch', 'bg-amber-50 text-amber-800 ring-amber-200'],
  pass: ['Pass', 'bg-rose-50 text-rose-800 ring-rose-200'],
};
const STANCE = { agree: 'Agrees with your read', partly: 'Partly agrees with your read', disagree: 'Disagrees with your read' };
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ReviewCard({ c, kind, ready }) {
  const i = c.inputs;
  const ro = !c.canEdit;
  const review = parse(i.review);
  const stale = review && review.sig !== numbersSig(i);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [left, setLeft] = useState(null);
  async function run() {
    setBusy(true); setErr(null);
    try {
      const r = await call('toolkit/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ calc: { kind, title: c.form.title, inputs: i } }) });
      c.setInput('review', JSON.stringify({ ...r.review, sig: numbersSig(i) }));
      setLeft(Math.max(0, r.today.limit - r.today.asked));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const noRead = !i.readCall && !String(i.read || '').trim();
  return (
    <Panel title="Your Read & Claude’s Review" sub="Make your call first — Claude reviews it" bodyClass="p-5 grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">
      <div className="flex flex-col gap-3">
        <div className="text-[12.5px] font-semibold text-navy-800">Your call</div>
        <div className="flex flex-wrap gap-2">
          {CALLS.map(([k, l]) => (
            <button key={k} type="button" disabled={ro} onClick={() => c.setInput('readCall', i.readCall === k ? '' : k)} aria-pressed={i.readCall === k}
              className={`h-9 px-3.5 rounded-lg text-[13.5px] font-semibold ring-1 ${i.readCall === k ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-300 hover:bg-tan-50'}`}>{l}</button>
          ))}
        </div>
        <textarea value={i.read || ''} readOnly={ro} onChange={(e) => c.setInput('read', e.target.value)} rows={4}
          placeholder="Why? What do you like, what worries you, what would you change? (a sentence or two)"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-navy-100" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} disabled={busy || !ready || c.me?.viewAs} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">
            {busy ? 'Claude is reviewing…' : review ? 'Review Again' : 'Get Claude’s Review'}
          </button>
          {!ready && <span className="text-[12.5px] text-zinc-500">Fill in the numbers first.</span>}
          {ready && noRead && !review && <span className="text-[12.5px] text-amber-700">Tip: make your call first — Claude will tell you where it agrees.</span>}
          {left != null && <span className="text-[12px] text-zinc-500">{left} Claude questions / reviews left today</span>}
        </div>
        {err && <div className="text-[13px] text-red-700">{err}</div>}
        <p className="text-[12px] text-zinc-500">Claude only knows the numbers here and VPG’s rules — not the market. It asks the questions; you find the answers. Works on drafts; saving keeps your read and the review with the calculation.</p>
      </div>
      <div className="min-w-0">
        {!review ? (
          <div className="h-full min-h-[160px] rounded-xl border border-dashed border-tan-300 bg-tan-50/50 grid place-items-center text-center text-[13px] text-zinc-500 px-6">The review shows here — a verdict, questions to check, numbers that look off and a lever or two.</div>
        ) : (
          <div className={`rounded-xl border border-tan-200 bg-white p-4 flex flex-col gap-3 ${stale ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ring-1 ${VERDICT[review.verdict]?.[1] || ''}`}>{VERDICT[review.verdict]?.[0] || review.verdict}</span>
              {STANCE[review.stance] && <span className="text-[12.5px] font-semibold text-navy-800">{STANCE[review.stance]}</span>}
              <span className="ml-auto text-[11.5px] text-zinc-400">{review.at ? when(review.at) : ''}</span>
            </div>
            {stale && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12.5px] text-amber-900">The numbers changed since this review — run it again for an up-to-date one.</div>}
            <p className="text-[13.5px] text-zinc-800">{review.summary}</p>
            {review.stanceNote && <p className="text-[13px] text-zinc-600 italic">{review.stanceNote}</p>}
            {review.questions?.length > 0 && <Block title="Questions to check before you offer" items={review.questions} tone="text-navy-800" mark="?" />}
            {review.flags?.length > 0 && <Block title="Numbers that look off" items={review.flags} tone="text-amber-800" mark="!" />}
            {review.levers?.length > 0 && (
              <div>
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-tan-600 mb-1">Levers</div>
                <ul className="flex flex-col gap-1">{review.levers.map((l, n) => <li key={n} className="text-[13px] text-zinc-800"><b className="text-navy-800">{l.change}</b> → {l.effect}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Block({ title, items, tone, mark }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-tan-600 mb-1">{title}</div>
      <ul className="flex flex-col gap-1">{items.map((q, n) => <li key={n} className="flex gap-2 text-[13px] text-zinc-800"><span className={`font-bold ${tone}`}>{mark}</span><span>{q}</span></li>)}</ul>
    </div>
  );
}
