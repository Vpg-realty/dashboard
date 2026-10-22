import { useEffect, useMemo, useState } from 'react';
import { ALL_MARKETS as MARKETS, ALL_REPS as REPS, SUBACCOUNTS, REPO_OWNER, REPO_NAME } from '../data/config.js';
import { STATE_DOT } from '../utils/marketShade.js';
import { PAIRS } from '../data/source.js';
import { classifyPair } from '../utils/pairHealth.js';
import { pickColor, suggestRepId, suggestMarketCode } from '../utils/autoColor.js';
import { settingsUsers, saveUser } from '../utils/dashApi.js';
import { PanelHead } from '../shell/Panel.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import {
  hasPAT, getStoredPAT, setStoredPAT,
  validatePAT, readConfig, addSubAccount,
  reassignSubAccount, deleteSubAccount,
} from '../utils/githubApi.js';

// Sub-Accounts panel. Modes:
//   • View — live list of every connected (rep × market) pair with its
//     locationId, color, and health. Each row has an inline Edit button
//     that reassigns the sub-account to a different rep OR deletes it.
//   • Add  — form to wire up a new sub-account. When a PAT is configured
//     this writes subaccounts.json + the PIT secret + triggers a deploy
//     via the GitHub API, so the new pair shows up on the TV in ~3 min
//     without anyone touching the repo.
//   • Reps — manage the rep roster: rename, add new reps, delete reps
//     with zero sub-accounts assigned. Every mutation is a real GitHub
//     commit against subaccounts.json + a deploy dispatch (Luke, June:
//     "make it completely REAL" — no localStorage-only stubs).
//   • Settings — GitHub PAT management.
// `inline` (Oct 19): drawn as a page in Settings › Sub-Accounts instead of a
// pop-up.
export default function SubAccountsPanel({ open, onClose, dataStatus, snapshotErrors, inline = false }) {
  const [mode, setMode] = useState('view');     // 'view' | 'settings'
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);   // { tone, text }
  const [patPresent, setPatPresent] = useState(hasPAT());

  useEffect(() => {
    if (!open) { setMode('view'); setStatus(null); return; }
    setPatPresent(hasPAT());
    const onEsc = (e) => e.key === 'Escape' && !inline && onClose?.();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={inline ? 'w-full' : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm'} onClick={inline ? undefined : onClose}>
      <div
        className={inline ? 'w-full overflow-hidden rounded-xl border border-tan-200 bg-white flex flex-col' : 'w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-2xl flex flex-col'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-zinc-300 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Sub-Accounts</h2>
            <p className="text-xs text-zinc-500 mt-1">
              {SUBACCOUNTS.length} connected · {REPO_OWNER}/{REPO_NAME}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('settings')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                mode === 'settings'
                  ? 'bg-zinc-200 border-zinc-400 text-zinc-900'
                  : 'border-zinc-300 text-zinc-500 hover:text-zinc-800'
              }`}
              title="GitHub PAT settings"
            >⚙</button>
            {!inline && <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-900 text-2xl leading-none -mt-1"
              aria-label="Close"
            >×</button>}
          </div>
        </div>

        {/* Status banner */}
        {status && (
          <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm border ${TONES[status.tone] || TONES.zinc}`}>
            {status.text}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {mode === 'view' && (
            <AddForm busy={busy} setBusy={setBusy} setStatus={setStatus} patPresent={patPresent} onNeedsPAT={() => setMode('settings')} />
          )}
          {mode === 'view' && (
            <ViewMode
              snapshotErrors={snapshotErrors}
              dataStatus={dataStatus}
              patPresent={patPresent}
              busy={busy}
              setBusy={setBusy}
              setStatus={setStatus}
              onNeedsPAT={() => setMode('settings')}
            />
          )}
          {mode === 'settings' && (
            <SettingsMode
              patPresent={patPresent}
              setPatPresent={setPatPresent}
              setStatus={setStatus}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
  rose:    'bg-rose-500/10 text-rose-700 border-rose-500/30',
  amber:   'bg-amber-500/10 text-amber-700 border-amber-500/30',
  blue:    'bg-blue-500/10 text-blue-700 border-blue-500/30',
  zinc:    'bg-zinc-100 text-zinc-800 border-zinc-400',
};

// --- VIEW MODE -----------------------------------------------------------

function ViewMode({ snapshotErrors, patPresent, busy, setBusy, setStatus, onNeedsPAT }) {
  const [editingLoc, setEditingLoc] = useState(null);

  const errorsByLoc = useMemo(() => {
    const m = new Map();
    for (const e of snapshotErrors || []) m.set(e.locationId, e);
    return m;
  }, [snapshotErrors]);

  const rows = SUBACCOUNTS.map((sa) => {
    const rep = REPS.find((r) => r.id === sa.repId);
    const market = MARKETS.find((m) => m.id === sa.marketId);
    const pair = PAIRS.find((p) => p.repId === sa.repId && p.marketId === sa.marketId);
    const health = classifyPair(pair, errorsByLoc.get(sa.locationId));
    return { sa, rep, market, health };
  });

  const tally = rows.reduce((a, r) => { a[r.health.tier] = (a[r.health.tier] || 0) + 1; return a; }, {});

  return (
    <div className="space-y-5">
      {/* Summary + action buttons */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <Pill tone="emerald" label={`${tally.live || 0} live`} />
          <Pill tone="amber"   label={`${tally.idle || 0} idle`} />
          <Pill tone="zinc"    label={`${tally.placeholder || 0} pending`} />
          <Pill tone="rose"    label={`${tally.error || 0} errors`} />
        </div>
      </div>

      {/* PAT not configured warning */}
      {!patPresent && (
        <div className="px-4 py-3 rounded-lg text-xs border bg-amber-500/10 text-amber-700 border-amber-500/30">
          ⚠ GitHub isn’t connected in this browser yet. Connect it once with <span className="font-semibold">⚙</span> (top
          right) — adding, moving or removing a sub-account saves through it.
        </div>
      )}

      {/* Sub-account list — each row has an Edit action that expands inline to
          reassign the sub to a different rep or delete it entirely. */}
      <div className="rounded-lg border border-zinc-300 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 bg-zinc-100 border-b border-zinc-300 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <div>Sub-account</div>
          <div className="text-right">Health</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-zinc-200">
          {rows.map(({ sa, rep, market, health }) => (
            <div key={sa.locationId} className="min-w-0">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 hover:bg-zinc-50 transition min-w-0 items-center">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: rep?.color || '#52525b' }} />
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATE_DOT }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-900 truncate">
                      {rep?.name || sa.repId} <span className="text-zinc-500">·</span> {market?.name || sa.marketId}
                    </div>
                    <CopyableLocationId locationId={sa.locationId} />
                  </div>
                </div>
                <div className="flex items-center shrink-0">
                  <Pill tone={health.tone} label={health.label} />
                </div>
                <div className="flex items-center shrink-0">
                  <button
                    onClick={() => setEditingLoc(editingLoc === sa.locationId ? null : sa.locationId)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${
                      editingLoc === sa.locationId
                        ? 'bg-zinc-800 text-white border-zinc-800'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    {editingLoc === sa.locationId ? 'Close' : 'Edit'}
                  </button>
                </div>
              </div>
              {editingLoc === sa.locationId && (
                <EditSubRow
                  sub={sa}
                  currentRep={rep}
                  busy={busy}
                  setBusy={setBusy}
                  setStatus={setStatus}
                  patPresent={patPresent}
                  onNeedsPAT={onNeedsPAT}
                  onDone={() => setEditingLoc(null)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Inline row that expands under a sub-account when you click Edit. Real
// operations only — reassign hits the reassignSubAccount GitHub-write path,
// delete removes both the subaccounts.json row AND the PIT secret.
function EditSubRow({ sub, currentRep, busy, setBusy, setStatus, patPresent, onNeedsPAT, onDone }) {
  const [selectedRepId, setSelectedRepId] = useState(sub.repId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = selectedRepId !== sub.repId;

  const requirePAT = () => {
    if (patPresent) return true;
    setStatus({ tone: 'amber', text: 'Add a GitHub PAT in Settings first, then come back here.' });
    onNeedsPAT();
    return false;
  };

  const reassign = async () => {
    if (!dirty || busy) return;
    if (!requirePAT()) return;
    setBusy(true);
    setStatus({ tone: 'blue', text: `Reassigning ${sub.locationId} → ${selectedRepId}…` });
    try {
      await reassignSubAccount(sub.locationId, selectedRepId);
      setStatus({ tone: 'emerald', text: `Reassigned to ${selectedRepId}. Deploy triggered — TV updates in ~3 min.` });
      setTimeout(onDone, 900);
    } catch (err) {
      setStatus({ tone: 'rose', text: `Reassign failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (busy) return;
    if (!requirePAT()) return;
    setBusy(true);
    setStatus({ tone: 'blue', text: `Deleting ${sub.locationId} + its PIT secret…` });
    try {
      await deleteSubAccount(sub.locationId);
      setStatus({ tone: 'emerald', text: `Deleted ${sub.locationId}. Deploy triggered.` });
      setTimeout(onDone, 900);
    } catch (err) {
      setStatus({ tone: 'rose', text: `Delete failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3 border-t border-zinc-200 bg-zinc-50 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1">Reassign to rep</label>
          <select
            value={selectedRepId}
            onChange={(e) => setSelectedRepId(e.target.value)}
            className={INPUT}
            disabled={busy}
          >
            {REPS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.id === sub.repId ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={reassign}
          disabled={!dirty || busy}
          className={`px-3 py-2 rounded-md text-xs font-medium border transition ${
            dirty && !busy
              ? 'bg-emerald-500 text-zinc-950 border-emerald-500 hover:bg-emerald-400'
              : 'bg-zinc-100 text-zinc-400 border-zinc-300 cursor-not-allowed'
          }`}
        >
          {busy ? 'Saving…' : 'Save reassignment'}
        </button>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-200 pt-3">
        <span className="text-[11px] text-zinc-500">
          Deleting removes both the config row AND the PIT GitHub secret. The GHL sub-account itself is untouched.
        </span>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1 rounded text-[11px] text-zinc-700 border border-zinc-300 hover:bg-zinc-100"
              disabled={busy}
            >Cancel</button>
            <button
              onClick={doDelete}
              disabled={busy}
              className="px-2.5 py-1 rounded text-[11px] font-medium bg-rose-600 text-white border border-rose-600 hover:bg-rose-500 disabled:opacity-60"
            >{busy ? 'Deleting…' : 'Yes, delete'}</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="px-2.5 py-1 rounded text-[11px] font-medium text-rose-700 border border-rose-300 hover:bg-rose-50 disabled:opacity-60"
          >Delete sub-account</button>
        )}
      </div>
    </div>
  );
}

function Pill({ tone, label }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-widest border ${TONES[tone] || TONES.zinc}`}>
      {label}
    </span>
  );
}

function CopyableLocationId({ locationId }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(locationId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <button
      onClick={copy}
      className="text-[11px] font-mono text-zinc-500 hover:text-zinc-800 transition truncate text-left"
      title="Copy location ID"
    >
      {locationId} {copied ? '✓ copied' : '⧉'}
    </button>
  );
}

// --- ADD FORM ------------------------------------------------------------
// Luke, Oct 22: "an easy way to add a single sub account with the api and
// location id, then assign it a market and rep … if it is a new market then
// we get to add a new market … we cannot add a new rep if the rep is not
// listed on the people page". One row on top of the page: Rep (people from
// Settings › People only), Market (or "+ Add a new market"), GHL Location ID,
// API key. A person not on the board yet becomes a rep here (their name and
// a free colour) and is linked to it in People.
const NEW_MARKET = '__new';
const REP_ROLES = ['team', 'manager', 'trainee', 'owner'];

function AddForm({ busy, setBusy, setStatus, patPresent, onNeedsPAT }) {
  const [people, setPeople] = useState(null);
  const [who, setWho] = useState('');
  const [marketId, setMarketId] = useState('');
  const [newMarketName, setNewMarketName] = useState('');
  const [newMarketCode, setNewMarketCode] = useState('');
  const [locationId, setLocationId] = useState('');
  const [pitToken, setPitToken] = useState('');
  useEffect(() => { settingsUsers().then((d) => setPeople(d.users || [])).catch(() => setPeople([])); }, []);

  const list = (people || []).filter((u) => REP_ROLES.includes(u.role) && (u.status || 'active') !== 'inactive' && (u.role !== 'owner' || u.rep_id));
  const person = list.find((u) => u.email === who) || null;
  const newMarket = marketId === NEW_MARKET;
  const code = (newMarketCode || suggestMarketCode(newMarketName, MARKETS.map((m) => m.id))).toUpperCase();
  const loc = locationId.trim();
  const taken = loc && SUBACCOUNTS.find((s) => s.locationId === loc);
  const repIdOf = (u) => u.rep_id || suggestRepId(u.name);
  const already = person && !newMarket && marketId && SUBACCOUNTS.find((s) => s.repId === repIdOf(person) && s.marketId === marketId);
  const codeTaken = newMarket && MARKETS.some((m) => m.id === code);
  const ready = person && (newMarket ? newMarketName.trim().length >= 2 && code.length >= 2 && !codeTaken : !!marketId)
    && loc.length >= 8 && !taken && pitToken.trim().length >= 8;

  const submit = async () => {
    if (!ready || busy) return;
    if (!patPresent) { setStatus({ tone: 'amber', text: 'Connect GitHub first (⚙ at the top right) — it stores the API key as a secret.' }); onNeedsPAT(); return; }
    setBusy(true);
    try {
      setStatus({ tone: 'blue', text: 'Reading the sub-account list…' });
      const { config, sha } = await readConfig();
      if ((config.subaccounts || []).some((x) => x.locationId === loc)) throw new Error(`location ID ${loc} is already connected`);
      const repId = repIdOf(person);
      const known = (config.reps || []).find((r) => r.id === repId);
      const newRep = known ? null : { id: repId, name: person.name, color: pickColor(repId, (config.reps || []).map((r) => r.color)) };
      const market = newMarket ? { id: code, name: newMarketName.trim(), color: pickColor(code, (config.markets || []).map((m) => m.color)) } : null;
      setStatus({ tone: 'blue', text: 'Saving the sub-account and its API key, then starting a refresh…' });
      await addSubAccount({ config, sha, newMarket: market, newRep, subaccount: { repId, marketId: newMarket ? code : marketId, locationId: loc }, pitToken: pitToken.trim() });
      // Tie the person to their rep in People (their first sub-account).
      if (!person.rep_id) await saveUser({ email: person.email, name: person.name, role: person.role, rep_id: repId, newRep: true });
      setStatus({ tone: 'emerald', text: `Added ${person.name} · ${newMarket ? newMarketName.trim() : MARKETS.find((m) => m.id === marketId)?.name}. It shows on the board after the refresh that just started (a few minutes).` });
      setLocationId(''); setPitToken(''); setNewMarketName(''); setNewMarketCode(''); setMarketId('');
      if (!person.rep_id) setPeople((ps) => ps.map((u) => (u.email === person.email ? { ...u, rep_id: repId } : u)));
    } catch (err) {
      setStatus({ tone: 'rose', text: `Not added: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const lbl = 'block text-[12.5px] font-semibold text-navy-800 mb-1';
  const box = 'w-full h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-navy-100';
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden mb-5">
      <PanelHead title="Add a Sub-Account" note="Rep from Settings › People · market · the GHL location ID and API key" />
      <div className="p-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.2fr_auto] items-end">
        <div>
          <span className={lbl}>Rep</span>
          <SearchSelect value={who} onChange={(v) => setWho(v || '')} placeholder={people ? 'Pick a person' : 'Loading people…'} clearable={false}
            options={list.map((u) => ({ value: u.email, label: `${u.name}${u.rep_id ? '' : ' · not on the board yet'}` }))} />
        </div>
        <div>
          <span className={lbl}>Market</span>
          <SearchSelect value={marketId} onChange={(v) => setMarketId(v || '')} placeholder="Pick a state" clearable={false}
            pinned={[{ value: NEW_MARKET, label: '+ Add a new market' }]} options={MARKETS.map((m) => ({ value: m.id, label: `${m.name} (${m.id})` }))} />
        </div>
        <label>
          <span className={lbl}>GHL Location ID</span>
          <input value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="GHL › Settings › Business Profile" className={`${box} font-mono`} />
        </label>
        <label>
          <span className={lbl}>API key (Private Integration Token)</span>
          <input type="password" value={pitToken} onChange={(e) => setPitToken(e.target.value)} placeholder="pit-…" autoComplete="off" className={`${box} font-mono`} />
        </label>
        <button type="button" onClick={submit} disabled={!ready || busy}
          className={`h-8 px-5 rounded-md text-[13.5px] font-semibold ${ready && !busy ? 'bg-navy-700 text-white hover:bg-navy-800' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'}`}>
          {busy ? 'Adding…' : 'Add'}
        </button>
        {newMarket && (
          <div className="md:col-span-2 xl:col-span-5 grid gap-3 sm:grid-cols-[1fr_8rem] max-w-xl">
            <label><span className={lbl}>New market name</span><input value={newMarketName} onChange={(e) => setNewMarketName(e.target.value)} placeholder="e.g. Missouri" className={box} /></label>
            <label><span className={lbl}>Code</span><input value={newMarketCode || (newMarketName ? code : '')} onChange={(e) => setNewMarketCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="MO" className={`${box} font-mono`} /></label>
          </div>
        )}
        {(taken || already || codeTaken || (person && !person.rep_id)) && (
          <div className="md:col-span-2 xl:col-span-5 text-[13px] flex flex-col gap-1">
            {taken && <span className="text-rose-700">That location ID is already connected ({REPS.find((r) => r.id === taken.repId)?.name || taken.repId} · {taken.marketId}).</span>}
            {already && <span className="text-amber-700">{person.name} already has a {MARKETS.find((m) => m.id === marketId)?.name} sub-account — this adds a second one.</span>}
            {codeTaken && <span className="text-rose-700">{code} is already used by {MARKETS.find((m) => m.id === code)?.name} — pick it from the list or use another code.</span>}
            {person && !person.rep_id && <span className="text-zinc-600">{person.name} isn’t on the board yet — this puts them on it and links them in People.</span>}
          </div>
        )}
        <p className="md:col-span-2 xl:col-span-5 text-[12.5px] text-zinc-500">Someone missing from Rep? Add them in Settings › People first. The API key is stored as an encrypted GitHub secret and never shown again.</p>
      </div>
    </section>
  );
}

const INPUT = 'w-full px-3 py-2.5 rounded-lg bg-zinc-100 border border-zinc-300 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition';

function Section({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-600">{label}</label>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ value, onChange, placeholder, mono, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${INPUT} ${mono ? 'font-mono' : ''}`}
    />
  );
}

// --- SETTINGS MODE -------------------------------------------------------

function SettingsMode({ patPresent, setPatPresent, setStatus }) {
  const [pat, setPat] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!pat.trim()) return;
    setBusy(true);
    setStatus({ tone: 'blue', text: 'Validating PAT against GitHub…' });
    try {
      await validatePAT(pat.trim());
      setStoredPAT(pat.trim());
      setPatPresent(true);
      setPat('');
      setStatus({ tone: 'emerald', text: 'PAT saved + validated. You can add sub-accounts now.' });
    } catch (err) {
      setStatus({ tone: 'rose', text: `Validation failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setStoredPAT('');
    setPatPresent(false);
    setStatus({ tone: 'amber', text: 'PAT cleared from this browser.' });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-zinc-900">GitHub PAT</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          A fine-grained token scoped to <span className="font-mono">{REPO_OWNER}/{REPO_NAME}</span> is required
          for one-click sub-account adds. Stored only in this browser's localStorage.
        </p>
      </div>

      <div className="rounded-lg bg-white border border-blue-500/20 p-4 space-y-3 text-sm text-zinc-800">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-blue-700 mb-1.5">Required scopes</div>
          <ul className="text-xs text-zinc-600 space-y-1 list-disc pl-5">
            <li>Repository Contents: <span className="text-zinc-900">Read and Write</span> (updates subaccounts.json)</li>
            <li>Repository Secrets: <span className="text-zinc-900">Read and Write</span> (stores PIT per location)</li>
            <li>Repository Actions: <span className="text-zinc-900">Read and Write</span> (triggers deploy on add)</li>
          </ul>
        </div>
        <a
          href={`https://github.com/settings/personal-access-tokens/new?name=VPG+Dashboard+Self-Serve&description=Used+by+the+Sub-Accounts+panel+on+the+VPG+dashboard&target_name=${REPO_OWNER}`}
          target="_blank" rel="noreferrer"
          className="inline-block text-xs text-blue-700 hover:text-blue-200 underline"
        >
          Create a new fine-grained PAT →
        </a>
      </div>

      <Section label="Paste PAT">
        <Field type="password" mono value={pat} onChange={setPat} placeholder="github_pat_xxxxxxxx_xxxxxxxxxxxxxx" />
      </Section>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-300">
        <span className="text-xs text-zinc-500">
          {patPresent ? '✓ PAT currently stored (' + getStoredPAT().slice(0, 9) + '…)' : 'No PAT stored'}
        </span>
        <div className="flex gap-2">
          {patPresent && (
            <button onClick={clear} className="px-3 py-2 rounded-lg text-sm text-rose-700 hover:bg-rose-500/10 border border-zinc-300 transition">
              Clear
            </button>
          )}
          <button
            onClick={save}
            disabled={!pat.trim() || busy}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              pat.trim() && !busy
                ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
            }`}
          >
            {busy ? 'Validating…' : 'Save PAT'}
          </button>
        </div>
      </div>
    </div>
  );
}
