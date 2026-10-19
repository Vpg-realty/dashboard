// Zip rules (Luke, Oct 14: "a list of the rules for the zip center so we know
// what to edit over time and which areas to address immediately if we are
// hitting bad data"); since Oct 19 a drawer on the Zip Center (the data
// health list is on its Overview). Owners edit the numbers.
import { useState } from 'react';
import { zipAction } from './store.js';

const FIELDS = {
  perRequest: { label: 'Zips per request', unit: 'zips' },
  perWeek: { label: 'Requests per rep per state per week', unit: 'requests' },
  holdDays: { label: 'Days a zip is held', unit: 'days' },
  tier3At: { label: 'Tier 3 joins when tier 1 + 2 used reaches', unit: '%', pct: true },
  tier3Mix: { label: 'Tier 3 zips per request after that', unit: 'zips' },
  lowLeft: { label: 'Warn when a state has fewer than', unit: 'requests left' },
  sheetPullDays: { label: 'Old sheet pulls stay with that rep for', unit: 'days' },
};

// What a bad-data signal means and what to do about it, most urgent first.
const PLAYBOOK = [
  ['now', 'A state is out of zips', 'Every usable zip has been handed out this round, or is held.', 'Approve a new round (Zip Center › Overview → Needs attention), or add counties to the state. Don\'t start a new round just to give a rep more if the zips came back bad.'],
  ['now', 'Several zips flagged in one county', 'The county\'s agent data is likely poor (landlines, DND, no agents).', 'Open the state, select the county and Pause it; re-pull the data, then set it Active again.'],
  ['now', 'A rep flagged a zip', 'One zip looks bad to the rep working it.', 'Clear the flag if it\'s fine (it goes back into requests), or Exclude the zip for good.'],
  ['now', 'A request came up short', 'The state had fewer zips left than a request gives.', 'Same as "out of zips" — approve a new round or add counties.'],
  ['now', 'A rep works a state with no zips on file', 'Their sub-account\'s state isn\'t in the territory data.', 'Add the state\'s counties and zips (send them to Claude to import).'],
  ['soon', 'A state is running low', 'Only a few requests\' worth left.', 'Decide before it runs out: more counties, a new round, or point reps to another state.'],
  ['info', 'Tier 3 is mixing in', 'Most of the state\'s tier 1 + 2 zips are used; requests now include smaller zips.', 'Expect thinner data. Watch the flags; consider adding counties or focus cities.'],
  ['info', 'Zips with no tier / hand-picked lists', 'The sheet gave no population tier.', 'Tier them when you can — they count as tier 3 (no tier) or tier 1 (hand-picked) until then.'],
  ['info', 'Focus cities not set', 'Some states need reps close to set cities.', 'When the cities are confirmed, send them to Claude — requests will then only pick zips near them.'],
];
const DOT = { now: 'bg-red-600', soon: 'bg-amber-500', info: 'bg-sky-600' };

function RulesEditor({ rules, onDone }) {
  const [v, setV] = useState(rules);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
      {Object.entries(FIELDS).map(([k, f]) => (
        <label key={k} className="flex items-center gap-3">
          <span className="flex-1 text-[13.5px] text-zinc-700">{f.label}</span>
          <input type="number" min="0" step={f.pct ? 5 : 1} value={f.pct ? Math.round(v[k] * 100) : v[k]} onChange={(e) => setV({ ...v, [k]: f.pct ? Number(e.target.value) / 100 : Number(e.target.value) })} className="h-9 w-20 rounded-lg border border-zinc-200 px-2 text-right tabular-nums text-[13.5px]" />
          <span className="w-24 text-[12.5px] text-zinc-500">{f.unit}</span>
        </label>
      ))}
      <div className="md:col-span-2 flex items-center gap-2 pt-2">
        <button disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await zipAction('rules', { value: v }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); } }} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold disabled:opacity-40">Save rules</button>
        <button onClick={onDone} className="h-9 px-3 text-zinc-500">Cancel</button>
        {err && <span className="text-[13px] text-red-700">{err}</span>}
        <span className="ml-auto text-[12.5px] text-zinc-500">Changes apply to the next request; zips already held keep their dates.</span>
      </div>
    </div>
  );
}

// The rules, the numbers owners can change and the bad-data playbook, in a
// side drawer opened from the Zip Center's ⓘ (Luke, Oct 19).
export default function ZipRulesDrawer({ data: d, owner, onClose }) {
  const [edit, setEdit] = useState(false);
  const groups = [];
  for (const r of d.ruleText || []) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) groups.push(g = { name: r.group, items: [] });
    g.items.push(r);
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-900/30" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} role="presentation">
      <aside role="dialog" aria-label="Zip rules" onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[640px] overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-navy-700 text-white px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">How Zips Are Handed Out</h2>
          {owner && !edit && <button onClick={() => setEdit(true)} className="ml-auto h-8 px-3 rounded-md bg-tan-500 text-navy-900 text-[12.5px] font-semibold hover:bg-tan-400">Edit the numbers</button>}
          <button type="button" autoFocus onClick={onClose} aria-label="Close" className={`${owner && !edit ? '' : 'ml-auto '}grid place-items-center w-8 h-8 rounded-full hover:bg-white/15 text-lg`}>×</button>
        </div>
        {edit ? <RulesEditor rules={d.rules} onDone={() => setEdit(false)} /> : groups.map((g) => (
          <div key={g.name} className="px-5 py-4 border-b border-tan-100">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-tan-700 mb-2">{g.name}</div>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((r, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] text-zinc-800">
                  <span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${r.key ? 'bg-navy-600' : 'bg-zinc-300'}`} />
                  <span className={r.key ? 'text-navy-900 font-medium' : ''}>{r.text}{r.key && <span className="ml-1.5 text-[11px] font-normal text-navy-600">editable</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="px-5 pt-5 pb-2 text-[12px] font-semibold uppercase tracking-wide text-tan-700">When the data looks bad — what to do</div>
        <div className="px-5 pb-6 flex flex-col gap-3">
          {PLAYBOOK.map(([lvl, sig, means, todo]) => (
            <div key={sig} className="rounded-lg border border-tan-100 px-4 py-3">
              <div className="font-medium text-zinc-900"><span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${DOT[lvl]}`} />{sig}</div>
              <div className="mt-0.5 text-[13px] text-zinc-600">{means}</div>
              <div className="mt-1 text-[13px] text-zinc-800">{todo}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
