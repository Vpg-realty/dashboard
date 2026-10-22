// Ask Claude on the calculators (Luke, Oct 22: "an ask claude section here
// specific to how we are calculating these items"): a floating button that
// opens a side panel like the Territory chat. Each person's own private
// conversation; Claude sees the calculation open on the page and VPG's
// formulas (edge/calcChat.js), 25 questions a day.
import { useEffect, useRef, useState } from 'react';
import Markdown from '../chat/Markdown.jsx';
import { useMe } from '../utils/dashApi.js';
import { calcAskLoad, calcAsk } from './store.js';

const SUGGEST = {
  seller: ['How do I get this to $300 a month in cash flow?', 'Explain the balloon payment in plain words.', 'What’s the seller’s effective yield, and why does it matter?'],
  mf: ['Why is the cash-on-cash this low, and what would fix it?', 'What price gets this to 10% cash-on-cash?', 'Why do we use 12% for maintenance?'],
};
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function Spark() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.6L19.5 9l-5.7 1.6L12 16l-1.8-5.4L4.5 9l5.7-1.4z" /><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" opacity=".7" /></svg>;
}

function Panel({ calc, onClose }) {
  const [s, setS] = useState({ status: 'loading' });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const end = useRef(null);
  useEffect(() => { let on = true; calcAskLoad().then((r) => on && setS({ status: 'ready', ...r })).catch((e) => on && setS({ status: 'error', error: e.message })); return () => { on = false; }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [s.messages?.length, busy]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  async function send(text) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setBusy(true); setErr(null); setQ('');
    setS((x) => ({ ...x, messages: [...x.messages, { id: 'p', role: 'user', text: question, at: new Date().toISOString() }] }));
    try {
      const r = await calcAsk(question, calc);
      setS((x) => ({ ...x, messages: [...x.messages.filter((m) => m.id !== 'p'), r.question, r.answer], today: r.today }));
    } catch (e) {
      setErr(e.message); setQ(question);
      setS((x) => ({ ...x, messages: x.messages.filter((m) => m.id !== 'p') }));
    } finally { setBusy(false); }
  }
  const left = s.today ? Math.max(0, s.today.limit - s.today.asked) : null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/25" onClick={onClose} />
      <section className="relative w-full max-w-[560px] h-full bg-tan-50 shadow-2xl flex flex-col" role="dialog" aria-label="Ask Claude">
        <header className="shrink-0 bg-navy-700 text-white px-5 py-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400"><Spark />Ask Claude · only you see this</div>
            <h2 className="mt-1 text-[19px] font-semibold">{calc.kind === 'mf' ? 'Multifamily Numbers' : 'Seller Finance Numbers'}</h2>
            <div className="text-[12.5px] text-navy-100 mt-0.5">How VPG works these numbers out, and what would change them. Claude sees the calculation on this page.{left != null ? ` ${left} of ${s.today.limit} questions left today.` : ''}</div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-1" aria-label="Close">×</button>
        </header>
        {s.status === 'loading' && <div className="p-8 text-center text-zinc-400">Loading…</div>}
        {s.status === 'error' && <div className="p-8 text-center text-zinc-500">{s.error}</div>}
        {s.status === 'ready' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              {!s.ready && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">Claude switches on with the next deploy.</div>}
              {!s.messages.length && (
                <div className="rounded-xl border border-tan-200 bg-white p-4">
                  <div className="font-semibold text-navy-800">Ask about these numbers.</div>
                  <div className="mt-3 flex flex-col gap-1.5">{(SUGGEST[calc.kind] || SUGGEST.seller).map((t) => <button key={t} onClick={() => send(t)} className="text-left rounded-lg border border-tan-200 px-3 py-2 text-[13px] text-navy-800 hover:bg-tan-50">{t}</button>)}</div>
                </div>
              )}
              {s.messages.map((m) => (m.role === 'user' ? (
                <div key={m.id} className="self-end max-w-[85%]">
                  <div className="text-[11px] text-zinc-500 text-right mb-0.5">You · {when(m.at)}</div>
                  <div className="rounded-2xl rounded-tr-sm bg-navy-700 text-white px-3.5 py-2 text-[13.5px] whitespace-pre-wrap">{m.text}</div>
                </div>
              ) : (
                <div key={m.id} className="max-w-[95%]">
                  <div className="text-[11px] text-zinc-500 mb-0.5 flex items-center gap-1"><span className="text-tan-600"><Spark /></span>Claude · {when(m.at)}</div>
                  <div className="rounded-2xl rounded-tl-sm border border-tan-200 bg-white px-4 py-3 text-[13.5px] text-zinc-900"><Markdown text={m.text} /></div>
                </div>
              )))}
              {busy && <div className="text-[13px] text-zinc-500 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-tan-500 animate-pulse" />Claude is working it out…</div>}
              <div ref={end} />
            </div>
            <footer className="shrink-0 border-t border-tan-200 bg-white p-3">
              {err && <div className="mb-2 text-[12.5px] text-red-700">{err}</div>}
              <div className="flex items-end gap-2">
                <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} placeholder="Ask about these numbers… (Enter to send)" className="flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-navy-100" />
                <button onClick={() => send()} disabled={busy || !q.trim() || !s.ready || left === 0} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">Ask</button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

export default function CalcAsk({ calc }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (!me || me.viewAs) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed z-40 bottom-24 md:bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-navy-700 text-white pl-4 pr-5 h-11 shadow-lg ring-4 ring-tan-50 hover:bg-navy-800">
        <span className="text-tan-400"><Spark /></span><span className="font-semibold">Ask Claude about These Numbers</span>
      </button>
      {open && <Panel calc={calc} onClose={() => setOpen(false)} />}
    </>
  );
}
