// One person, everything about them, one Save (Luke, Oct 26: "a master tab
// that all info is edited in … minimal clicks and almost no effort when adding
// a new member"; the approved mock-up "One Place for the Team"). Opened from
// Settings › Team (a row, or "+ Add a Team Member"):
//   Basics      first and last name (the site shows the first name only),
//               email (new only), role, status (Acquisitions:
//               Active / Training / Inactive), started / ended
//   Pod Lead    Acquisitions: who they report to (deal_lists.reportsTo, by
//               name); in training that's also their trainer
//   States      tick the GHL sub-accounts they take over — a move to another
//               rep is saved on the site (edge/subChanges.js); their first one
//               creates their rep and links it, so there's no "rep on the
//               board" to pick any more
//   Commission  their acq. % and dispo % from a date — no "standard" choice
//               (Luke, Oct 26); deal_rules `acqOf:<name>` / `acqOfNet:<name>`
//               (acq on net) and `dispoOf:<name>`
//   TV Board    show / leave off (settings board_hidden)
// Save runs the existing calls in order (people, sub-accounts, pod lead,
// commission, TV) and lists what was saved.
import { useMemo, useState } from 'react';
import { ALL_REPS, ALL_MARKETS, SUBACCOUNTS } from '../data/config.js';
import { pickColor, suggestRepId } from '../utils/autoColor.js';
import { saveUser, removeUser, writeSetting, changeRule } from '../utils/dashApi.js';
import { updateSubAccount } from '../utils/subaccountsApi.js';
import { laToday } from '../utils/historyRange.js';
import { linkProps } from '../shell/router.js';
import { inputCls } from './ui.jsx';
import SearchBox from '../shell/SearchBox.jsx';
import { ratesOf } from '../deals/rules.js';
import { ROLE_OPTS, keyName } from './team.js';

const repOf = (id) => ALL_REPS.find((r) => r.id === id) || null;
const marketName = (id) => ALL_MARKETS.find((m) => m.id === id)?.name || id;
const first = (n) => String(n || '').trim().split(' ')[0];
const uiRole = (u) => (u.role === 'trainee' ? 'team' : u.role);
const uiStatus = (u) => (u.role === 'trainee' ? 'training' : u.status === 'inactive' ? 'inactive' : 'active');

function Part({ title, note, children }) {
  return (
    <section className="px-5 py-3.5 border-b border-tan-200 flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-[11.5px] font-bold uppercase tracking-[0.14em] text-tan-800">{title}{note && <span className="normal-case tracking-normal font-normal text-zinc-500 text-[12px]">{note}</span>}</h3>
      {children}
    </section>
  );
}
function Pills({ value, onChange, options, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l, sub]) => (
        <button key={String(v)} type="button" disabled={disabled} onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 text-[13px] font-semibold ring-1 disabled:opacity-50 ${value === v ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-300 hover:bg-tan-50'}`}>
          {l}{sub && <span className={`ml-1 font-normal ${value === v ? 'text-white/70' : 'text-zinc-500'}`}>{sub}</span>}
        </button>
      ))}
    </div>
  );
}

// u = the person (null = a new one); users = everyone (to tell whose
// sub-accounts are whose); leads = who can lead a pod [{id, name, title}]; lists = deal_lists;
// tvOff = rep ids off the board; rules = today's commission rules.
export default function TeamPanel({ u, users, leads, lists, tvOff, rules, me, onSaved, onRemoved, onClose }) {
  const today = laToday();
  const isNew = !u;
  const start = useMemo(() => (u ? {
    // An older entry with the whole name in `name` opens split (Luke, Oct 26).
    name: u.last_name ? u.name : String(u.name || '').trim().split(' ')[0], last: u.last_name || String(u.name || '').trim().split(' ').slice(1).join(' '),
    email: u.email, role: uiRole(u), status: uiStatus(u), started: u.started || '', ended: u.ended || '',
  } : { name: '', last: '', email: '', role: 'team', status: 'training', started: today, ended: '' }), [u, today]);
  const [d, setD] = useState(start);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const key = u ? keyName(u) : String(d.name || '').trim();
  const leadNameOf = (id) => repOf(id)?.name || id;
  // Their pod lead: a trainee's trainer, else who they report to.
  const lead0 = u?.role === 'trainee' ? (u.trainer ? leadNameOf(u.trainer) : '') : (lists?.reportsTo?.[key] || '');
  const [lead, setLead] = useState(lead0);
  const [take, setTake] = useState(() => new Set());
  // What they're paid today: their own rates, else the company's (prefilled so
  // an untouched Save changes nothing); a new person starts blank.
  const r0 = ratesOf(rules, key);
  const pctTxt = (x) => (x == null ? '' : String(Math.round(x * 10000) / 100));
  const [acq, setAcq] = useState(isNew ? '' : pctTxt(r0.acq));
  const [onNet, setOnNet] = useState(r0.net);
  const [dispo, setDispo] = useState(isNew ? '' : pctTxt(r0.dispo));
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(today);
  const tv0 = !(u?.rep_id && tvOff.includes(u.rep_id));
  const [tv, setTv] = useState(tv0);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const self = u?.email === me?.email;
  const sales = d.role === 'team' || d.role === 'manager';
  const mine = u?.rep_id ? SUBACCOUNTS.filter((s) => s.repId === u.rep_id) : [];
  // Everyone else's sub-accounts, the inactive people's first (their states are
  // the ones to hand off).
  const goneReps = new Set(users.filter((x) => x.status === 'inactive' && x.rep_id).map((x) => x.rep_id));
  const others = SUBACCOUNTS.filter((s) => !u?.rep_id || s.repId !== u.rep_id)
    .map((s) => ({ ...s, who: repOf(s.repId)?.name || s.repId, gone: goneReps.has(s.repId) }))
    .sort((a, b) => (b.gone - a.gone) || a.who.localeCompare(b.who) || marketName(a.marketId).localeCompare(marketName(b.marketId)));
  const flip = (loc) => setTake((x) => { const n = new Set(x); if (n.has(loc)) n.delete(loc); else n.add(loc); return n; });
  const statuses = d.role === 'team' ? [['active', 'Active'], ['training', 'Training'], ['inactive', 'Inactive']] : d.role === 'owner' ? [['active', 'Active']] : [['active', 'Active'], ['inactive', 'Inactive']];
  const leadOpts = [...leads.filter((l) => l.name !== key).map((l) => [l.name, first(l.name), l.title]), ['', 'No pod']];
  const needLead = d.status === 'training' && !lead;
  const pctOk = (x) => x !== '' && Number(x) >= 0 && Number(x) <= 100;
  const rateOk = !sales || d.status === 'inactive' || (pctOk(acq) && pctOk(dispo) && /^\d{4}-\d{2}-\d{2}$/.test(from));
  const shown = others.filter((s) => !q.trim() || `${marketName(s.marketId)} ${s.marketId} ${s.who}`.toLowerCase().includes(q.trim().toLowerCase()));
  const ok = d.name.trim() && /@/.test(d.email) && !needLead && rateOk && !self;

  const save = async () => {
    if (!ok || busy) return;
    if (u && start.status === 'training' && d.status === 'active' && !window.confirm(`Move ${first(d.name)} out of training? This counts as graduating them.`)) return;
    if (u && d.status === 'inactive' && start.status !== 'inactive' && !window.confirm(`Set ${first(d.name)} inactive? They can’t sign in any more, their zips are released, their open alerts go to their pod lead and they leave the TV board. Their history stays.`)) return;
    setBusy(true);
    const out = [];
    const note = (good, text) => out.push({ good, text });
    try {
      const training = d.status === 'training';
      const trainer = training ? leads.find((l) => l.name === lead)?.id || null : null;
      const body = {
        email: d.email.trim(), name: d.name.trim(), last_name: d.last.trim(), role: training ? 'trainee' : d.role, status: d.status === 'inactive' ? 'inactive' : 'active',
        rep_id: u?.rep_id || null, started: d.started || null, ended: d.ended || null,
        ...(training ? { trainer, start: u?.start || d.started || today } : {}),
      };
      let person;
      try { person = (await saveUser(body)).user; note(true, isNew ? `${first(d.name)} added — they can sign in with their company email` : 'Details saved'); } catch (e) { note(false, `Not saved: ${e.message}`); setLog(out); return; }
      // States: a move to this person; their first one creates their rep.
      let repId = person.rep_id;
      if (take.size) {
        let id = repId;
        if (!id) {
          id = suggestRepId(first(person.name));
          if (repOf(id) && !users.some((x) => x.rep_id === id && x.email === person.email)) id = suggestRepId(person.name);
          if (repOf(id) && !users.some((x) => x.rep_id === id && x.email === person.email)) id = `${id}_${Date.now().toString(36).slice(-3)}`;
        }
        let newRep = repOf(id) ? null : { id, name: `${person.name} ${person.last_name || ''}`.trim(), color: pickColor(id, ALL_REPS.map((r) => r.color)) };
        let moved = 0;
        for (const loc of take) {
          const s = SUBACCOUNTS.find((x) => x.locationId === loc);
          try {
            await updateSubAccount({ locationId: loc, repId: id, marketId: s.marketId, newLocationId: null, newMarket: null, newRep, pit: null });
            newRep = null; moved++;
            note(true, `${marketName(s.marketId)} handed over (was ${first(repOf(s.repId)?.name || s.repId)})`);
          } catch (e) { note(false, `${marketName(s.marketId)} not moved: ${e.message}`); }
        }
        if (moved && !repId) {
          try { person = (await saveUser({ ...body, rep_id: id, newRep: true })).user; repId = id; } catch (e) { note(false, `Not linked to their sub-accounts: ${e.message}`); }
        }
      }
      // Pod lead (Acquisitions, not in training — a trainee's is their trainer, saved above).
      const k = repOf(repId)?.name || person.name;
      if (d.role === 'team' && !training && lead !== (lists?.reportsTo?.[k] || '')) {
        const next = { ...lists, reportsTo: { ...(lists?.reportsTo || {}) } };
        if (lead) next.reportsTo[k] = lead; else delete next.reportsTo[k];
        try { await writeSetting('deal-lists', next); note(true, lead ? `Reports to ${first(lead)}` : 'No pod lead'); } catch (e) { note(false, `Pod lead not saved: ${e.message}`); }
      }
      // Commission: write only what changed, from the date picked. Moving acq
      // between "of the commission base" and "of net" clears the other one.
      if (sales && d.status !== 'inactive') {
        const was = ratesOf(rules, k);
        const a = Number(acq) / 100; const dd = Number(dispo) / 100;
        const same = (x, y) => x != null && y != null && Math.abs(x - y) < 1e-9;
        const ch = [];
        if (onNet !== was.net || !same(a, was.acq) || was.acqOwn == null) {
          ch.push({ key: `${onNet ? 'acqOfNet' : 'acqOf'}:${k}`, value: a });
          if (onNet !== was.net && was.acqOwn != null) ch.push({ key: `${onNet ? 'acqOf' : 'acqOfNet'}:${k}`, value: null });
        }
        if (!same(dd, was.dispo) || was.dispoOwn == null) ch.push({ key: `dispoOf:${k}`, value: dd });
        let okAll = true;
        for (const c of ch) { try { await changeRule({ ...c, from }); } catch (e) { okAll = false; note(false, `Commission not saved: ${e.message}`); break; } }
        if (ch.length && okAll) note(true, `Commission: ${acq}% acq ${onNet ? 'of net' : 'of the commission base'} · ${dispo}% dispo, from ${from}`);
      }
      // TV board.
      if (repId && d.status !== 'inactive' && tv === tvOff.includes(repId)) {
        const next = tv ? tvOff.filter((x) => x !== repId) : [...new Set([...tvOff, repId])];
        try { await writeSetting('board-hidden', { repIds: next }); note(true, tv ? 'Shown on the TV board' : 'Left off the TV board'); } catch (e) { note(false, `TV board not saved: ${e.message}`); }
      }
      setLog(out);
      onSaved();
    } finally { setBusy(false); }
  };
  const remove = async () => {
    try { await removeUser(u.email); onRemoved(); } catch (e) { setLog([{ good: false, text: e.message }]); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" onClick={onClose} />
      <div className="relative w-full max-w-[560px] h-full bg-white shadow-2xl flex flex-col" role="dialog" aria-label={isNew ? 'Add a team member' : first(u.name)}>
        <div className="bg-navy-700 text-white px-5 py-4 shrink-0 flex items-start gap-3">
          <div className="min-w-0 mr-auto">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">{isNew ? 'New team member' : 'Team member'}</div>
            <div className="text-[20px] font-semibold leading-tight">{`${d.name} ${d.last}`.trim() || 'Add a Team Member'}</div>
            {!isNew && <div className="text-[12.5px] text-white/70">{u.email}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white text-2xl leading-none px-1">×</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {self && <div className="mx-5 mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900">That’s you — another owner changes your own access.</div>}
          <Part title="Basics">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 text-[12.5px] text-zinc-600">First name<input value={d.name} onChange={(e) => set('name')(e.target.value.replace(/\s+/g, ''))} disabled={self} placeholder="e.g. Jake" className={inputCls} /></label>
              <label className="flex flex-col gap-1 text-[12.5px] text-zinc-600">Last name<input value={d.last} onChange={(e) => set('last')(e.target.value)} disabled={self} placeholder="e.g. Rader" className={inputCls} /></label>
              <label className="col-span-2 flex flex-col gap-1 text-[12.5px] text-zinc-600">Company email<input value={d.email} onChange={(e) => set('email')(e.target.value)} disabled={!isNew} placeholder="name@valleypropertygroup.com" className={`${inputCls} disabled:bg-zinc-50`} /></label>
            </div>
            <div className="text-[12.5px] text-zinc-600">Role</div>
            <Pills value={d.role} disabled={self} onChange={(v) => setD((x) => ({ ...x, role: v, status: v === 'owner' ? 'active' : x.status === 'training' && v !== 'team' ? 'active' : x.status }))} options={ROLE_OPTS.map(([v, l]) => [v, l])} />
            <div className="text-[12.5px] text-zinc-600">Status</div>
            <Pills value={d.status} disabled={self} onChange={(v) => setD((x) => ({ ...x, status: v, ended: v === 'inactive' && !x.ended ? today : x.ended }))} options={statuses} />
            {d.status === 'training' && <span className="text-[12.5px] text-zinc-500">In the training program: My Training first, then Home, Pipeline and Get Zips. Their pod lead below trains them; they become Active when they graduate.</span>}
            {u?.role === 'trainee' && <a {...linkProps(`/team/training?trainee=${encodeURIComponent(u.email)}`)} className="text-[12.5px] text-navy-700 underline">Open their training file →</a>}
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 text-[12.5px] text-zinc-600">Started<input type="date" value={d.started} disabled={self} onChange={(e) => set('started')(e.target.value || d.started)} className={inputCls} /></label>
              <label className="flex flex-col gap-1 text-[12.5px] text-zinc-600">Ended<input type="date" value={d.ended} disabled={self} onChange={(e) => set('ended')(e.target.value || d.ended)} className={inputCls} /></label>
            </div>
          </Part>
          {d.role === 'team' && (
            <Part title="Pod Lead" note={d.status === 'training' ? 'their trainer too' : 'who they report to'}>
              <Pills value={lead} onChange={setLead} options={leadOpts.filter(([v]) => d.status !== 'training' || v)} />
              {needLead && <span className="text-[12.5px] text-[#B42318]">Pick their pod lead — they train them.</span>}
            </Part>
          )}
          {(sales || mine.length > 0) && (
            <Part title="States" note="their GHL sub-accounts">
              {mine.length > 0 && <div className="flex flex-wrap gap-1.5">{mine.map((s) => <span key={s.locationId} className="rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 px-3 py-1 text-[13px] font-semibold">✓ {marketName(s.marketId)}</span>)}</div>}
              {d.status !== 'inactive' && <>
                <span className="text-[12.5px] text-zinc-500">{mine.length ? 'Tick more to hand them over too.' : 'Tick the states they take over — their first one puts them on the board.'} {mine.length > 0 && 'To move one of theirs away, open the person taking it.'}</span>
                <SearchBox value={q} onChange={setQ} placeholder="Search a state or a rep…" className="w-full" />
                <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1 rounded-lg">
                  {shown.map((s) => (
                    <label key={s.locationId} className={`shrink-0 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] ring-1 ring-inset cursor-pointer ${take.has(s.locationId) ? 'bg-navy-50 ring-navy-300' : s.gone ? 'bg-amber-50/60 ring-amber-200' : 'ring-tan-200 hover:bg-tan-50'}`}>
                      <input type="checkbox" checked={take.has(s.locationId)} onChange={() => flip(s.locationId)} className="accent-[#1b385f] shrink-0" />
                      <b className="text-navy-900 w-36 shrink-0">{marketName(s.marketId)}</b>
                      <span className={`min-w-0 flex-1 truncate ${s.gone ? 'text-amber-800' : 'text-zinc-600'}`}>{s.who}{s.gone ? ' (inactive)' : ''}</span>
                      {take.has(s.locationId) && <span className="text-[11.5px] font-semibold text-navy-700 shrink-0">→ {first(d.name) || 'them'}</span>}
                    </label>
                  ))}
                  {!shown.length && <span className="px-1 py-2 text-[13px] text-zinc-500">No sub-account matches “{q}”.</span>}
                </div>
                {take.size > 0 && <span className="text-[12.5px] font-semibold text-navy-800">{take.size} picked to hand over: {[...take].map((l) => marketName(SUBACCOUNTS.find((x) => x.locationId === l)?.marketId)).join(', ')}</span>}
                <a {...linkProps('/settings/subaccounts')} className="text-[12.5px] text-navy-700 underline self-start">A brand-new sub-account (new location ID and API key)? Add it in Connections →</a>
              </>}
            </Part>
          )}
          {sales && (
            <Part title="Commission" note="when they’re the acq. manager">
              {d.status === 'inactive' ? <span className="text-[13px] text-zinc-500">{pctTxt(r0.acq)}% acq · {pctTxt(r0.dispo)}% dispo — kept for their past deals.</span> : <>
                <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2 text-[13px]">
                  <span className="font-semibold text-navy-900">Acquisitions</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <input value={acq} onChange={(e) => setAcq(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 30" className={`${inputCls} !w-20 ${acq === '' ? 'ring-1 ring-[#B42318]/40' : ''}`} aria-label="Acquisition %" />%
                    <Pills value={onNet} onChange={setOnNet} options={[[false, 'of the commission base'], [true, 'of net']]} />
                  </span>
                  <span className="font-semibold text-navy-900">Dispo</span>
                  <span className="flex items-center gap-2">
                    <input value={dispo} onChange={(e) => setDispo(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 20" className={`${inputCls} !w-20 ${dispo === '' ? 'ring-1 ring-[#B42318]/40' : ''}`} aria-label="Dispo %" />% <span className="text-zinc-500">of the commission base</span>
                  </span>
                  <span className="font-semibold text-navy-900">Takes effect</span>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} !w-40`} aria-label="Takes effect on" />
                </div>
                <span className="text-[12px] text-zinc-500">Commission base = net assignment − TC fee. Closed deals keep the rates they had.</span>
              </>}
            </Part>
          )}
          {sales && d.status !== 'inactive' && (
            <Part title="TV Board" note="the office TV and Team Overview">
              {u?.rep_id || take.size ? <Pills value={tv} onChange={setTv} options={[[true, 'Show on the TV'], [false, 'Leave off']]} />
                : <span className="text-[13px] text-zinc-500">They go on the TV with their first state.</span>}
            </Part>
          )}
          {log && (
            <div className="mx-5 my-3 rounded-lg border border-tan-200 bg-tan-50 px-3 py-2 text-[13px]">
              {log.map((x, i) => <div key={i} className={x.good ? 'text-emerald-700' : 'text-red-700'}>{x.good ? '✓' : '✕'} {x.text}</div>)}
              {log.every((x) => x.good) && <div className="mt-1 text-zinc-500">States and the TV board update on the board with the next refresh (about 15 minutes).</div>}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-t border-tan-200 bg-tan-50">
          {!isNew && !self && (confirmDel
            ? <span className="mr-auto flex items-center gap-2 text-[13px]"><span className="text-red-700">Remove completely? Inactive keeps their history.</span><button type="button" onClick={remove} className="font-semibold text-red-700 underline">Remove</button><button type="button" onClick={() => setConfirmDel(false)} className="text-zinc-500 underline">Keep</button></span>
            : <button type="button" onClick={() => setConfirmDel(true)} className="mr-auto text-[13px] text-red-600 hover:underline">Remove</button>)}
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50">{log ? 'Close' : 'Cancel'}</button>
          {!log && <button type="button" disabled={!ok || busy} onClick={save} className="h-9 px-5 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : isNew ? `Add ${first(d.name) || 'Them'}` : `Save ${first(d.name)}`}</button>}
        </div>
      </div>
    </div>
  );
}
