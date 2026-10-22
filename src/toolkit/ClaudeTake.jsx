// Claude's take on the deal, right under the result tiles (Luke, later
// Oct 22: "draft a response on your thoughts about the deal, why, and
// thoughts on how to make it a better deal … providing them with reasoning
// so they can also understand where you are coming from … make it clearly
// stand out"). It replaced the rep's-read box and the Ask Claude chat. One
// click (POST /api/toolkit/review, edge/calcChat.js reviewCalc); works on
// drafts, and saving the calculation keeps the take with it, so pod leads
// and owners see it too. When the numbers change after a take, it says so.
import { useState } from 'react';
import { call } from '../utils/dashApi.js';
import { numbersSig } from './calc.js';

const VERDICT = {
  strong: ['Strong deal', 'bg-emerald-500 text-white'],
  workable: ['Workable', 'bg-sky-500 text-white'],
  stretch: ['Stretch', 'bg-amber-500 text-white'],
  pass: ['Pass', 'bg-rose-600 text-white'],
};
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
// Takes saved before the rework (Oct 22) used other field names.
const shape = (r) => r && ({
  verdict: r.verdict, at: r.at, sig: r.sig,
  take: r.take ?? r.summary ?? '',
  why: r.why ?? r.flags ?? [],
  better: r.better ?? (r.levers || []).map((l) => ({ change: l.change, effect: l.effect })),
  check: r.check ?? r.questions ?? [],
});
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ClaudeTake({ c, kind, ready }) {
  const i = c.inputs;
  const r = shape(parse(i.review));
  const stale = r && r.sig !== numbersSig(i);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [left, setLeft] = useState(null);
  async function run() {
    setBusy(true); setErr(null);
    try {
      const out = await call('toolkit/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ calc: { kind, title: c.form.title, inputs: i } }) });
      c.setInput('review', JSON.stringify({ ...out.review, sig: numbersSig(i) }));
      setLeft(Math.max(0, out.today.limit - out.today.asked));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const v = r && VERDICT[r.verdict];
  const button = (
    <button type="button" onClick={run} disabled={busy || !ready || c.me?.viewAs}
      className="h-9 px-4 rounded-lg bg-tan-500 text-navy-900 text-[13.5px] font-semibold hover:bg-tan-400 disabled:opacity-40 shrink-0">
      {busy ? 'Claude is reading the deal…' : r ? (stale ? 'Update Claude’s Take' : 'Ask Again') : 'Get Claude’s Take'}
    </button>
  );
  return (
    <section className="rounded-2xl border-2 border-navy-700 bg-white shadow-sm overflow-hidden" aria-label="Claude’s take on this deal">
      <div className="bg-navy-700 text-white px-5 py-3 flex flex-wrap items-center gap-3">
        <span aria-hidden className="grid place-items-center w-8 h-8 rounded-full bg-tan-500 text-navy-900 text-[16px]">✦</span>
        <div className="min-w-0 mr-auto">
          <div className="text-[16px] font-semibold leading-tight">Claude’s Take on This Deal</div>
          <div className="text-[12px] text-white/70">What Claude thinks, why, and how to make it better — from the numbers above</div>
        </div>
        {v && <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${v[1]}`}>{v[0]}</span>}
        {button}
      </div>
      <div className="p-5">
        {!r ? (
          <p className="text-[13.5px] text-zinc-600">{ready ? 'Fill in what you know, then get Claude’s take — it explains what it thinks of the deal, the reasoning behind it, and what would make it a better deal.' : 'Fill in the numbers first — Claude reads the calculation as it is on the page.'}</p>
        ) : (
          <div className={`flex flex-col gap-4 ${stale ? 'opacity-60' : ''}`}>
            {stale && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12.5px] text-amber-900">The numbers changed since this take — update it for an up-to-date one.</div>}
            <p className="text-[15px] leading-relaxed text-zinc-900">{r.take}</p>
            {r.why.length > 0 && (
              <Part title="Why">
                <ul className="flex flex-col gap-1.5">{r.why.map((w, n) => <li key={n} className="flex gap-2 text-[13.5px] text-zinc-800"><span className="text-navy-700 font-bold">•</span><span>{w}</span></li>)}</ul>
              </Part>
            )}
            {r.better.length > 0 && (
              <Part title="How to Make It a Better Deal">
                <ol className="flex flex-col gap-2">
                  {r.better.map((b, n) => (
                    <li key={n} className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13.5px]">
                      <div><b className="text-navy-800">{b.change}</b>{b.effect && <span className="text-emerald-800"> → {b.effect}</span>}</div>
                      {b.why && <div className="text-zinc-600 mt-0.5">{b.why}</div>}
                    </li>
                  ))}
                </ol>
              </Part>
            )}
            {r.check.length > 0 && (
              <Part title="Check Before You Offer">
                <ul className="flex flex-col gap-1.5">{r.check.map((q, n) => <li key={n} className="flex gap-2 text-[13.5px] text-zinc-800"><span className="font-bold text-tan-600">?</span><span>{q}</span></li>)}</ul>
              </Part>
            )}
            <div className="text-[11.5px] text-zinc-400">{r.at ? `${when(r.at)} · ` : ''}Claude only knows the numbers on this page and VPG’s rules — not the market.{left != null ? ` ${left} takes left today.` : ''}</div>
          </div>
        )}
        {err && <div className="mt-2 text-[13px] text-red-700">{err}</div>}
      </div>
    </section>
  );
}

function Part({ title, children }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-tan-600 mb-1.5">{title}</div>
      {children}
    </div>
  );
}
