// "Ask Claude" (Luke, Oct 14): a button on the Territory and Zip center pages
// that opens a side panel. Owners: one shared conversation (both owners see
// the same thread), "What Claude remembers" (edit / delete) and this month's
// spend against the cap. Reps and managers (Zip center only): their own
// private conversation about their zips — read-only, zip data only, a few
// dozen questions a day. The server (functions/api/chat) does the asking and
// decides which conversation is whose.
import { useEffect, useRef, useState } from 'react';
import { useMe, chatLoad, chatAsk, chatSetCap, chatRemember, chatForget } from '../utils/dashApi.js';
import Markdown from './Markdown.jsx';

const SUGGEST = {
  territory: [
    'Which reps are most exposed to a winter slowdown, and what would you change?',
    'Which states have the most reps but the fewest opps this month?',
    'Where should we add a rep next, and why?',
  ],
  zips: [
    'Who holds zips right now, and which expire in the next week?',
    'Which states are closest to running out of tier 1 and 2 zips?',
    'Are any zips flagged as bad data, and is there a pattern by county?',
  ],
  rep: [
    'Which of my zips expire in the next 7 days?',
    'List all my zips by county so I can copy them.',
    'How many tier 1 and 2 zips are still available in my states?',
  ],
};
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const money = (x) => `$${(x || 0).toFixed(2)}`;

function Spark() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.6L19.5 9l-5.7 1.6L12 16l-1.8-5.4L4.5 9l5.7-1.4z" /><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" opacity=".7" /></svg>;
}

function Panel({ page, onClose }) {
  const [s, setS] = useState({ status: 'loading' });
  const [tab, setTab] = useState('chat');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [memText, setMemText] = useState('');
  const [capEdit, setCapEdit] = useState(null);
  const end = useRef(null);
  useEffect(() => { let on = true; chatLoad(page).then((r) => on && setS({ status: 'ready', ...r })).catch((e) => on && setS({ status: 'error', error: e.message })); return () => { on = false; }; }, [page]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [s.messages?.length, busy, tab]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  async function send(text) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setBusy(true); setErr(null); setQ('');
    const pending = { id: 'p', role: 'user', text: question, name: 'You', at: new Date().toISOString() };
    setS((x) => ({ ...x, messages: [...x.messages, pending] }));
    try {
      await chatAsk(page, question);
      const fresh = await chatLoad(page); // picks up new memories, spend, today's count
      setS({ status: 'ready', ...fresh });
    } catch (e) {
      setErr(e.message);
      setQ(question);
      setS((x) => ({ ...x, messages: x.messages.filter((m) => m.id !== 'p') }));
    } finally { setBusy(false); }
  }

  const m = s.month;
  const isRep = s.mode === 'rep';
  const suggest = SUGGEST[isRep ? 'rep' : page] || SUGGEST.territory;
  const tabs = isRep ? [['chat', 'Conversation']] : [['chat', 'Conversation'], ['memory', `What Claude remembers${s.memory ? ` · ${s.memory.length}` : ''}`]];
  const left = s.today ? Math.max(0, s.today.limit - s.today.asked) : null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/25" onClick={onClose} />
      <section className="relative w-full max-w-[620px] h-full bg-tan-50 shadow-2xl flex flex-col" role="dialog" aria-label="Ask Claude">
        <header className="shrink-0 bg-navy-700 text-white px-5 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400"><Spark />Ask Claude · {isRep ? 'only you see this' : 'owners only'}</div>
              <h2 className="mt-1 text-[19px] font-semibold">{isRep ? 'Your Zips' : page === 'zips' ? 'Territory & Zip Questions' : 'Territory Questions'}</h2>
              <div className="text-[12.5px] text-navy-100 mt-0.5">{isRep ? 'Look up your zips and what’s available in your states. To get or release zips, use the buttons on My zips.' : 'One shared conversation for Luke and Jack. Answers come from today’s dashboard data and live zip holds.'}</div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-1" aria-label="Close">×</button>
          </div>
          <div className="flex items-end gap-5 mt-3">
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`pb-2.5 border-b-[3px] text-[13.5px] font-medium ${tab === k ? 'border-tan-400 text-white' : 'border-transparent text-white/60 hover:text-white'}`}>{l}</button>
            ))}
            {isRep && left != null && <span className="ml-auto pb-2.5 text-[12px] text-navy-100">{left} of {s.today.limit} questions left today</span>}
            {m && (
              <span className="ml-auto pb-2.5 text-[12px] text-navy-100">
                {capEdit == null ? (
                  <button onClick={() => setCapEdit(String(m.cap))} title="Change the monthly cap" className="hover:text-white">{money(m.spent)} of {money(m.cap)} this month ✎</button>
                ) : (
                  <span className="inline-flex items-center gap-1">cap $<input autoFocus value={capEdit} onChange={(e) => setCapEdit(e.target.value)} className="w-16 rounded bg-white/10 px-1 text-white outline-none" />
                    <button onClick={async () => { try { const r = await chatSetCap(Number(capEdit)); setS((x) => ({ ...x, month: r.month })); setCapEdit(null); } catch (e) { setErr(e.message); } }} className="font-semibold text-white">Save</button>
                    <button onClick={() => setCapEdit(null)} className="text-white/60">×</button></span>
                )}
              </span>
            )}
          </div>
        </header>

        {s.status === 'loading' && <div className="p-8 text-center text-zinc-400">Loading…</div>}
        {s.status === 'error' && <div className="p-8 text-center text-zinc-500">{s.error}</div>}
        {s.status === 'ready' && tab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
              {!s.ready && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">The chat switches on with the next deploy (about 15 minutes after this update goes live).</div>}
              {!s.messages.length && (
                <div className="rounded-xl border border-tan-200 bg-white p-4">
                  <div className="font-semibold text-navy-800">{isRep ? 'Ask about your zips.' : 'Ask anything about reps, states, deals or zips.'}</div>
                  <div className="text-[13px] text-zinc-600 mt-1">{isRep ? 'Claude sees the zips you hold, when they expire, and what’s still available in your states. It can’t change anything.' : 'Claude sees the territory sheet, every rep’s numbers by state, the GHL pipeline, the deal tracker and the zip center’s live holds. Tell it decisions (“remember: Danni owns Maricopa”) and it keeps them for next time.'}</div>
                  <div className="mt-3 flex flex-col gap-1.5">{suggest.map((t) => <button key={t} onClick={() => send(t)} className="text-left rounded-lg border border-tan-200 px-3 py-2 text-[13px] text-navy-800 hover:bg-tan-50">{t}</button>)}</div>
                </div>
              )}
              {s.messages.map((msg) => (
                msg.role === 'user' ? (
                  <div key={msg.id} className="self-end max-w-[85%]">
                    <div className="text-[11px] text-zinc-500 text-right mb-0.5">{msg.name} · {when(msg.at)}</div>
                    <div className="rounded-2xl rounded-tr-sm bg-navy-700 text-white px-3.5 py-2 text-[13.5px] whitespace-pre-wrap">{msg.text}</div>
                  </div>
                ) : (
                  <div key={msg.id} className="max-w-[95%]">
                    <div className="text-[11px] text-zinc-500 mb-0.5 flex items-center gap-1"><span className="text-tan-600"><Spark /></span>Claude · {when(msg.at)}{msg.cost != null ? ` · ${money(msg.cost)}` : ''}{msg.tools?.includes('remember') ? ' · saved a memory' : ''}</div>
                    <div className="rounded-2xl rounded-tl-sm border border-tan-200 bg-white px-4 py-3 text-[13.5px] text-zinc-900"><Markdown text={msg.text} /></div>
                  </div>
                )
              ))}
              {busy && <div className="text-[13px] text-zinc-500 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-tan-500 animate-pulse" />Claude is looking at the data…</div>}
              <div ref={end} />
            </div>
            <footer className="shrink-0 border-t border-tan-200 bg-white p-3">
              {err && <div className="mb-2 text-[12.5px] text-red-700">{err}</div>}
              <div className="flex items-end gap-2">
                <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} placeholder={isRep ? 'Ask about your zips… (Enter to send)' : 'Ask about reps, states, deals or zips… (Enter to send)'} className="flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-navy-100" />
                <button onClick={() => send()} disabled={busy || !q.trim() || !s.ready} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">Ask</button>
              </div>
            </footer>
          </>
        )}
        {s.status === 'ready' && tab === 'memory' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            <div className="text-[13px] text-zinc-600">Sent with every question. Claude adds to it when you tell it a decision; remove anything that's wrong or out of date.</div>
            <div className="rounded-xl border border-tan-200 bg-white divide-y divide-tan-100">
              {s.memory.map((mm) => (
                <div key={mm.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] text-zinc-900">{mm.text}</div><div className="text-[11.5px] text-zinc-500 mt-0.5">{mm.by_name} · {when(mm.at)}</div></div>
                  <button onClick={async () => { const r = await chatForget(mm.id); setS((x) => ({ ...x, memory: r.memory })); }} className="text-[12.5px] text-red-700 hover:underline">Remove</button>
                </div>
              ))}
              {!s.memory.length && <div className="px-4 py-5 text-center text-zinc-500">Nothing saved yet.</div>}
            </div>
            <div className="flex gap-2">
              <input value={memText} onChange={(e) => setMemText(e.target.value)} placeholder="Add one yourself, e.g. “Michigan stays paused until spring 2027.”" className="flex-1 h-9 rounded-lg border border-zinc-200 px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-navy-100" />
              <button onClick={async () => { if (!memText.trim()) return; const r = await chatRemember(memText.trim()); setS((x) => ({ ...x, memory: r.memory })); setMemText(''); }} className="h-9 px-3 rounded-lg bg-navy-700 text-white font-medium">Add</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// The floating button on the Territory pages: owners, and reps / managers with
// a rep on the board (the server checks again and picks the thread). While an
// owner is viewing as someone (Luke, Oct 15: "ask claude option is missing for
// everyone besides owners on the get zips page" — it was only hidden by View
// as) the button shows as that person would see it, opening a preview: the
// conversation is theirs alone and nothing can be asked as them.
function Preview({ name, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/25" onClick={onClose} />
      <section className="relative w-full max-w-[620px] h-full bg-tan-50 shadow-2xl flex flex-col" role="dialog" aria-label="Ask Claude">
        <header className="shrink-0 bg-navy-700 text-white px-5 py-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400"><Spark />Ask Claude · only they see this</div>
            <h2 className="mt-1 text-[19px] font-semibold">Their Zips</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-1" aria-label="Close">×</button>
        </header>
        <div className="p-6 text-[14px] text-zinc-700 leading-relaxed">
          <p><b>{name}</b> gets this button on the Territory pages: a private conversation with Claude about their own zips and what's free in their states (25 questions a day).</p>
          <p className="mt-3 text-zinc-500">You're viewing as {name}, so their conversation isn't shown and nothing can be asked in their name. Exit “View as” to use your own.</p>
        </div>
      </section>
    </div>
  );
}

export default function AskClaude({ page = 'territory' }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const owner = me.role === 'owner';
  const rep = ['team', 'manager'].includes(me.role) && me.rep_id;
  if (!owner && !rep) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed z-40 bottom-24 md:bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-navy-700 text-white pl-4 pr-5 h-11 shadow-lg ring-4 ring-tan-50 hover:bg-navy-800">
        <span className="text-tan-400"><Spark /></span><span className="font-semibold">Ask Claude</span>
      </button>
      {open && (me.viewAs ? <Preview name={me.name} onClose={() => setOpen(false)} /> : <Panel page={page} onClose={() => setOpen(false)} />)}
    </>
  );
}
