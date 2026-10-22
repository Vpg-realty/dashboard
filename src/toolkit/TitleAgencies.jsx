// Toolkit › Title Agencies (Luke, Oct 22: "a list of this with market
// selector for easy navigation by everyone. this should be editable by
// owners, tc, and managers"). One list by state, with "All other states" at
// the end; the market chips pick a state; ★ = the one to use first there.
// Stored in D1 title_agencies (the repo is public — never in code).
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import MarketChips from '../shell/MarketChips.jsx';
import SearchBox from '../shell/SearchBox.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { useToolkit, act } from './store.js';

const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const ABBR = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const OTHER = 'Other';
const stateLabel = (s) => (s === OTHER ? 'All Other States' : s);
const byState = (a, b) => (a === OTHER) - (b === OTHER) || a.localeCompare(b);
const EMPTY = { state: '', name: '', contact: '', email: '', phone: '', address: '', notes: '' };
const inputCls = 'h-9 w-full rounded-lg border border-zinc-200 px-2.5 text-[13.5px] outline-none focus:ring-2 focus:ring-navy-100';

function Form({ initial, onDone }) {
  const [f, setF] = useState({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setBusy(true); setErr(null);
    try { await act({ action: 'agency', id: initial?.id, ...f }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const field = (k, label, ph, wide) => (
    <label className={`flex flex-col gap-1 text-[12px] font-semibold text-navy-800 ${wide ? 'sm:col-span-2' : ''}`}>{label}
      <input value={f[k]} onChange={set(k)} placeholder={ph} className={`${inputCls} font-normal`} />
    </label>
  );
  return (
    <div className="rounded-xl border border-navy-200 bg-navy-50/40 p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-navy-800">Market
          <SearchSelect value={f.state || null} onChange={(v) => setF((x) => ({ ...x, state: v || '' }))} clearable={false} placeholder="Pick the state"
            pinned={[{ value: OTHER, label: 'All other states' }]} options={US_STATES.map((s) => ({ value: s, label: s }))} />
        </label>
        {field('name', 'Title company', 'e.g. Pioneer Title Agency')}
        {field('contact', 'Contact', 'Escrow officer / closing attorney')}
        {field('email', 'Email', 'name@company.com')}
        {field('phone', 'Phone', '602-555-0100')}
        {field('address', 'Address', 'Street, city, state zip')}
        {field('notes', 'Notes', 'Anything the team should know', true)}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy || !f.state || !f.name.trim()} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onDone} className="h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-700">Cancel</button>
        {err && <span className="text-[13px] text-red-700">{err}</span>}
      </div>
    </div>
  );
}

function CopyBtn({ a }) {
  const [done, setDone] = useState(false);
  const text = [a.name, a.contact, a.email, a.phone, a.address].filter(Boolean).join('\n');
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* blocked */ } }}
      className="text-[12.5px] font-medium text-navy-700 hover:underline">{done ? 'Copied ✓' : 'Copy'}</button>
  );
}

function Row({ a, can }) {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  if (edit) return <div className="px-5 py-3"><Form initial={a} onDone={() => setEdit(false)} /></div>;
  const run = async (body) => { setBusy(true); try { await act(body); } catch (e) { alert(e.message); } finally { setBusy(false); } };
  return (
    <div className={`px-5 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-x-5 gap-y-1 items-start ${a.preferred ? 'bg-tan-50/70' : ''}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {can ? (
            <button type="button" disabled={busy} onClick={() => run({ action: 'prefer', id: a.id })} title={a.preferred ? 'Preferred in this state — click to clear' : 'Make this the preferred one in this state'}
              className={`text-[17px] leading-none ${a.preferred ? 'text-tan-500' : 'text-zinc-300 hover:text-tan-400'}`}>★</button>
          ) : a.preferred ? <span className="text-[17px] leading-none text-tan-500">★</span> : null}
          <span className="font-semibold text-navy-800 text-[14.5px]">{a.name}</span>
          {a.preferred ? <span className="rounded-full bg-tan-200 px-2 py-0.5 text-[11px] font-semibold text-navy-900">Use first</span> : null}
        </div>
        {a.contact && <div className="text-[13px] text-zinc-600 mt-0.5">{a.contact}</div>}
      </div>
      <div className="min-w-0 text-[13.5px]">
        {a.email && <a href={`mailto:${a.email}`} className="block text-navy-700 hover:underline truncate">{a.email}</a>}
        {a.phone && <div className="text-zinc-700">{a.phone.split(/\s*\|\s*/).map((p, i) => <a key={i} href={`tel:${p.replace(/[^\d+]/g, '').slice(-11)}`} className="block hover:underline">{p}</a>)}</div>}
      </div>
      <div className="min-w-0 text-[13px] text-zinc-600">
        {a.address && <div>{a.address}</div>}
        {a.notes && <div className="text-zinc-500 italic">{a.notes}</div>}
      </div>
      <div className="flex items-center gap-3 md:justify-end">
        <CopyBtn a={a} />
        {can && <button type="button" onClick={() => setEdit(true)} className="text-[12.5px] font-medium text-navy-700 hover:underline">Edit</button>}
        {can && <button type="button" disabled={busy} onClick={() => { if (confirm(`Remove ${a.name} from ${stateLabel(a.state)}?`)) run({ action: 'agencyRemove', id: a.id }); }} className="text-[12.5px] font-medium text-red-700 hover:underline">Remove</button>}
      </div>
    </div>
  );
}

export default function TitleAgencies() {
  const s = useToolkit();
  const query = useLocation().query;
  const st = query.get('st') || null;
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const can = !!s.can?.agencies;
  const groups = useMemo(() => {
    const m = new Map();
    for (const a of s.agencies || []) { if (!m.has(a.state)) m.set(a.state, []); m.get(a.state).push(a); }
    return [...m.entries()].sort((x, y) => byState(x[0], y[0]));
  }, [s.agencies]);
  const needle = q.trim().toLowerCase();
  const hit = (a) => !needle || [a.name, a.contact, a.email, a.phone, a.address, a.notes, a.state].join(' ').toLowerCase().includes(needle);
  const shown = groups.filter(([state]) => !st || state === st).map(([state, list]) => [state, list.filter(hit)]).filter(([, list]) => list.length);
  // A state with no agency of its own uses "All other states" — say so.
  const fallback = st && st !== OTHER && !groups.some(([g]) => g === st);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <MarketChips label="Market" allLabel="All markets" value={st} onChange={(v) => setQuery({ st: v })}
          options={groups.map(([state, list]) => ({ id: state, label: state === OTHER ? 'Other states' : ABBR[state] || state, count: list.length }))} />
        <div className="ml-auto flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Search agencies…" />
          {can && !adding && <button type="button" onClick={() => setAdding(true)} className="h-9 px-3.5 rounded-lg bg-navy-700 text-white font-semibold whitespace-nowrap">+ Add an Agency</button>}
        </div>
      </div>
      {adding && <Form initial={{ state: st || '' }} onDone={() => setAdding(false)} />}
      {s.status === 'loading' && <div className="py-10 text-center text-zinc-400">Loading…</div>}
      {s.status === 'error' && <div className="py-10 text-center text-zinc-500">{s.error}</div>}
      {fallback && <div className="rounded-xl border border-tan-200 bg-white px-4 py-3 text-[13.5px] text-zinc-700">No title company on file for {st} — use the one for all other states below{can ? ', or add one for this state' : ''}.</div>}
      {s.status === 'ready' && (fallback ? groups.filter(([g]) => g === OTHER) : shown).map(([state, list]) => (
        <Panel key={state} title={stateLabel(state)} right={<span>{list.length} {list.length === 1 ? 'agency' : 'agencies'}</span>} bodyClass="divide-y divide-tan-100">
          {list.map((a) => <Row key={a.id} a={a} can={can} />)}
        </Panel>
      ))}
      {s.status === 'ready' && !shown.length && !fallback && <div className="py-10 text-center text-zinc-500">{needle ? 'Nothing matches that search.' : 'No title agencies yet.'}</div>}
      <p className="text-[12.5px] text-zinc-500">{can ? 'Owners, managers and the TC edit this list — click Edit on a row, ★ to mark the one to use first in a state.' : 'Kept up to date by owners, managers and the TC. ★ = the one to use first in that state.'}</p>
    </div>
  );
}
