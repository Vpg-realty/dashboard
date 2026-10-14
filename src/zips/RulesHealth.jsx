// Zip center › Rules & data health (Luke, Oct 14: "a list of the rules for
// the zip center so we know what to edit over time and which areas to
// address immediately if we are hitting bad data"). Everyone sees the rules;
// owners edit the numbers. Owners, managers and the TC also see the data
// health list (fix now / coming up / edit over time) and the playbook.
import { useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { useMe } from '../utils/dashApi.js';
import { navigate } from '../shell/router.js';
import { useZips, zipAction } from './store.js';
import { HealthList } from './AllZips.jsx';

const FIELDS = {
  perRequest: { label: 'Zips per request', unit: 'zips' },
  perWeek: { label: 'Requests per rep per week', unit: 'requests' },
  holdDays: { label: 'Days a zip is held', unit: 'days' },
  tier3At: { label: 'Tier 3 joins when tier 1 + 2 used reaches', unit: '%', pct: true },
  tier3Mix: { label: 'Tier 3 zips per request after that', unit: 'zips' },
  lowLeft: { label: 'Warn when a state has fewer than', unit: 'requests left' },
  sheetPullDays: { label: 'Old sheet pulls stay with that rep for', unit: 'days' },
};

// What a bad-data signal means and what to do about it, most urgent first.
const PLAYBOOK = [
  ['now', 'A state is out of zips', 'Every usable zip has been handed out this round, or is held.', 'Approve a new round (All zips → Needs attention), or add counties to the state. Don\'t start a new round just to give a rep more if the zips came back bad.'],
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

export default function RulesHealth() {
  const me = useMe();
  const owner = me?.role === 'owner' && !me?.viewAs;
  const z = useZips();
  const [edit, setEdit] = useState(false);
  if (z.status === 'error') return <div className="py-16 text-center text-zinc-500">{z.error}</div>;
  if (z.status !== 'ready') return <div className="py-16 text-center text-zinc-400">Loading…</div>;
  const d = z.data;
  const groups = [];
  for (const r of d.ruleText) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) groups.push(g = { name: r.group, items: [] });
    g.items.push(r);
  }
  const health = d.health || null;
  const goState = (st) => navigate(`/territory/zip-mgmt?state=${encodeURIComponent(st)}`);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Rules & data health</h1>
        <div className="text-zinc-500 text-[13px]">How zips are handed out{health ? ', and what to fix when the data goes bad' : ''}. The numbers in navy can be changed{owner ? ' — click “Edit the numbers”' : ' by owners'}.</div>
      </div>

      {health && (
        <Panel title="Data health" sub={`${health.filter((h) => h.level === 'now').length} to fix now · ${health.filter((h) => h.level === 'soon').length} coming up · ${health.filter((h) => h.level === 'info').length} to edit over time`}>
          <HealthList items={health} owner={owner} onState={goState} />
        </Panel>
      )}

      <Panel title="The rules" right={owner && !edit && <button onClick={() => setEdit(true)} className="h-7 px-3 rounded-md bg-navy-700 text-white text-[12.5px] font-medium">Edit the numbers</button>}>
        {edit ? <RulesEditor rules={d.rules} onDone={() => setEdit(false)} /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {groups.map((g) => (
              <div key={g.name} className="px-5 py-4 border-b border-tan-100 lg:odd:border-r">
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
          </div>
        )}
      </Panel>

      {health && (
        <Panel title="When the data looks bad — what to do" sub="most urgent first">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-tan-50/60 text-[12px] text-zinc-500"><tr>{['Signal', 'What it means', 'What to do'].map((h, i) => <th key={h} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2.5 font-medium text-left`}>{h}</th>)}</tr></thead>
              <tbody>
                {PLAYBOOK.map(([lvl, sig, means, todo]) => (
                  <tr key={sig} className="border-t border-tan-100 align-top">
                    <td className="pl-5 px-3 py-2.5 font-medium text-zinc-900 whitespace-nowrap"><span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${DOT[lvl]}`} />{sig}</td>
                    <td className="px-3 py-2.5 text-zinc-600">{means}</td>
                    <td className="px-3 py-2.5 text-zinc-800">{todo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
