import { useEffect, useMemo, useState } from 'react';
import { MARKETS, REPS, SUBACCOUNTS, REPO_OWNER, REPO_NAME } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { classifyPair } from '../utils/pairHealth.js';
import { pickColor, suggestMarketCode, suggestRepId } from '../utils/autoColor.js';
import {
  hasPAT, getStoredPAT, setStoredPAT,
  validatePAT, readConfig, addSubAccount,
} from '../utils/githubApi.js';

// Sub-Accounts panel. Two modes:
//   • View — live list of every connected (rep × market) pair with its
//     locationId, color, and health (pulled from data.json + errors[]).
//   • Add  — form to wire up a new sub-account. When a PAT is configured
//     this writes subaccounts.json + the PIT secret + triggers a deploy
//     via the GitHub API, so the new pair shows up on the TV in ~3 min
//     without anyone touching the repo. Without a PAT we still capture
//     the entry locally and show Ram-friendly copy-paste instructions.
export default function SubAccountsPanel({ open, onClose, dataStatus, snapshotErrors }) {
  const [mode, setMode] = useState('view');     // 'view' | 'add' | 'settings'
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);   // { tone, text }
  const [patPresent, setPatPresent] = useState(hasPAT());

  useEffect(() => {
    if (!open) { setMode('view'); setStatus(null); return; }
    setPatPresent(hasPAT());
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-2xl flex flex-col"
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
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-900 text-2xl leading-none -mt-1"
              aria-label="Close"
            >×</button>
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
            <ViewMode
              snapshotErrors={snapshotErrors}
              dataStatus={dataStatus}
              onAddClick={() => setMode('add')}
              patPresent={patPresent}
            />
          )}
          {mode === 'add' && (
            <AddMode
              busy={busy}
              setBusy={setBusy}
              setStatus={setStatus}
              setMode={setMode}
              patPresent={patPresent}
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

function ViewMode({ snapshotErrors, onAddClick, patPresent }) {
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
      {/* Summary + add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <Pill tone="emerald" label={`${tally.live || 0} live`} />
          <Pill tone="amber"   label={`${tally.idle || 0} idle`} />
          <Pill tone="zinc"    label={`${tally.placeholder || 0} pending`} />
          <Pill tone="rose"    label={`${tally.error || 0} errors`} />
        </div>
        <button
          onClick={onAddClick}
          className="px-3.5 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition flex items-center gap-1.5"
        >
          <span className="text-base leading-none">+</span>
          Add Sub-Account
        </button>
      </div>

      {/* PAT not configured warning */}
      {!patPresent && (
        <div className="px-4 py-3 rounded-lg text-xs border bg-amber-500/10 text-amber-700 border-amber-500/30">
          ⚠ GitHub PAT not configured. Add one in <span className="font-semibold">⚙ Settings</span> to enable
          one-click sub-account adds. Without it, the Add form will still capture the entry but you'll
          need to commit the config + secret manually.
        </div>
      )}

      {/* Sub-account list */}
      <div className="rounded-lg border border-zinc-300 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 bg-zinc-100 border-b border-zinc-300 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <div>Sub-account</div>
          <div className="text-right">Health</div>
        </div>
        <div className="divide-y divide-zinc-200">
          {rows.map(({ sa, rep, market, health }) => (
            <div key={sa.locationId} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 hover:bg-zinc-50 transition min-w-0">
              <div className="min-w-0 flex items-center gap-3">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: rep?.color || '#52525b' }} />
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: market?.color || '#52525b' }} />
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
            </div>
          ))}
        </div>
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

// --- ADD MODE ------------------------------------------------------------

function AddMode({ busy, setBusy, setStatus, setMode, patPresent, onNeedsPAT }) {
  const existingRepIds = REPS.map((r) => r.id);
  const existingMarketIds = MARKETS.map((m) => m.id);

  const [repMode, setRepMode] = useState(existingRepIds[0] ? 'existing' : 'new');
  const [repId, setRepId] = useState(existingRepIds[0] || '');
  const [newRepName, setNewRepName] = useState('');

  const [marketMode, setMarketMode] = useState(existingMarketIds[0] ? 'existing' : 'new');
  const [marketId, setMarketId] = useState(existingMarketIds[0] || '');
  const [newMarketName, setNewMarketName] = useState('');
  const [newMarketCode, setNewMarketCode] = useState('');

  const [locationId, setLocationId] = useState('');
  const [pitToken, setPitToken] = useState('');

  // Auto-suggest a 2-letter code from the market name. Passes the current
  // MARKETS list so the suggestion never collides with an existing code —
  // "Missouri" cleanly resolves to "MO" (USPS) instead of bumping to "MX"
  // because its first two letters ("MI") collide with Michigan.
  useEffect(() => {
    if (marketMode === 'new' && newMarketName && !newMarketCode) {
      setNewMarketCode(suggestMarketCode(newMarketName, MARKETS.map((m) => m.id)));
    }
  }, [newMarketName, marketMode, newMarketCode]);

  const repColor = useMemo(() => {
    if (repMode === 'existing') return REPS.find((r) => r.id === repId)?.color || '#52525b';
    return pickColor(suggestRepId(newRepName) || 'new_rep', REPS.map((r) => r.color));
  }, [repMode, repId, newRepName]);

  const marketColor = useMemo(() => {
    if (marketMode === 'existing') return MARKETS.find((m) => m.id === marketId)?.color || '#52525b';
    return pickColor(newMarketCode || newMarketName || 'new_market', MARKETS.map((m) => m.color));
  }, [marketMode, marketId, newMarketCode, newMarketName]);

  const finalRepId = repMode === 'existing' ? repId : suggestRepId(newRepName);
  const finalMarketId = marketMode === 'existing' ? marketId : (newMarketCode || suggestMarketCode(newMarketName, MARKETS.map((m) => m.id)));

  const canSubmit =
    locationId.trim().length >= 8 &&
    pitToken.trim().length >= 8 &&
    (repMode === 'existing' ? !!repId : newRepName.trim().length >= 2) &&
    (marketMode === 'existing' ? !!marketId : (newMarketName.trim().length >= 2 && (newMarketCode || '').length >= 2));

  const submit = async () => {
    if (!canSubmit || busy) return;
    if (!patPresent) {
      setStatus({ tone: 'amber', text: 'Add a GitHub PAT in Settings first, then come back here.' });
      onNeedsPAT();
      return;
    }
    setBusy(true);
    setStatus({ tone: 'blue', text: 'Reading subaccounts.json from GitHub…' });
    try {
      const { config, sha } = await readConfig();
      // Bail if locationId already exists.
      if ((config.subaccounts || []).find((s) => s.locationId === locationId.trim())) {
        throw new Error(`locationId ${locationId.trim()} is already configured`);
      }
      const newMarket = marketMode === 'new'
        ? { id: finalMarketId, name: newMarketName.trim(), color: marketColor }
        : null;
      const newRep = repMode === 'new'
        ? { id: finalRepId, name: newRepName.trim(), color: repColor }
        : null;
      setStatus({ tone: 'blue', text: 'Writing config + secret + triggering deploy…' });
      await addSubAccount({
        config, sha,
        newMarket, newRep,
        subaccount: { repId: finalRepId, marketId: finalMarketId, locationId: locationId.trim() },
        pitToken: pitToken.trim(),
      });
      setStatus({
        tone: 'emerald',
        text: `Wired up ${finalRepId} · ${finalMarketId}. Deploy triggered — refresh the TV in ~3 min and the new sub-account will be live.`,
      });
      // Reset form, return to view mode.
      setLocationId('');
      setPitToken('');
      setNewRepName('');
      setNewMarketName('');
      setNewMarketCode('');
      setTimeout(() => setMode('view'), 1500);
    } catch (err) {
      setStatus({ tone: 'rose', text: `Failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => setMode('view')} className="text-xs text-zinc-500 hover:text-zinc-800 transition">← Back to list</button>
        <h3 className="text-base font-semibold text-zinc-900 mt-1">Add New Sub-Account</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Wires it into <span className="text-zinc-800">subaccounts.json</span>, writes the PIT to a per-location
          GitHub Secret, and triggers a deploy. All from this form.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rep */}
        <Section label="Rep">
          <ToggleRow value={repMode} onChange={setRepMode} options={[
            { id: 'existing', label: 'Existing' },
            { id: 'new', label: 'New rep' },
          ]} />
          {repMode === 'existing' ? (
            <select value={repId} onChange={(e) => setRepId(e.target.value)} className={INPUT}>
              {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : (
            <Field placeholder="e.g. Casey Smith" value={newRepName} onChange={setNewRepName} />
          )}
          <ColorPreview color={repColor} label={repMode === 'existing' ? 'Rep color' : 'Auto-assigned color'} />
        </Section>

        {/* Market */}
        <Section label="Market">
          <ToggleRow value={marketMode} onChange={setMarketMode} options={[
            { id: 'existing', label: 'Existing' },
            { id: 'new', label: 'New market' },
          ]} />
          {marketMode === 'existing' ? (
            <select value={marketId} onChange={(e) => setMarketId(e.target.value)} className={INPUT}>
              {MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
            </select>
          ) : (
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Field placeholder="Missouri" value={newMarketName} onChange={setNewMarketName} />
              <Field placeholder="MO" value={newMarketCode} onChange={(v) => setNewMarketCode(v.toUpperCase().slice(0, 4))} mono />
            </div>
          )}
          <ColorPreview color={marketColor} label={marketMode === 'existing' ? 'Market color' : 'Auto-assigned color'} />
        </Section>
      </div>

      <Section label="GHL Location ID">
        <Field
          mono
          value={locationId}
          onChange={setLocationId}
          placeholder="20-char string from GHL → Settings → Business Profile"
        />
      </Section>
      <Section label="Private Integration Token (PIT)">
        <Field
          mono
          type="password"
          value={pitToken}
          onChange={setPitToken}
          placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (sent encrypted; stored as a per-location GitHub Secret)"
        />
      </Section>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-300">
        <button onClick={() => setMode('view')} className="px-4 py-2 rounded-lg text-sm text-zinc-800 hover:bg-zinc-100 border border-zinc-300 transition">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit || busy}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            canSubmit && !busy
              ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
              : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
          }`}
        >
          {busy ? 'Adding…' : 'Add Sub-Account'}
        </button>
      </div>
    </div>
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

function ToggleRow({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden text-xs">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 transition ${
            value === o.id
              ? 'bg-zinc-200 text-zinc-900'
              : 'bg-white text-zinc-500 hover:text-zinc-800'
          }`}
        >{o.label}</button>
      ))}
    </div>
  );
}

function ColorPreview({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
      <span className="w-4 h-4 rounded-full border border-zinc-400" style={{ background: color }} />
      <span className="truncate">{label} · <span className="font-mono text-zinc-600">{color}</span></span>
    </div>
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
