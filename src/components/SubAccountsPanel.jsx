import { useEffect, useMemo, useState } from 'react';
import { MARKETS, REPS, SUBACCOUNTS, REPO_OWNER, REPO_NAME } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { classifyPair } from '../utils/pairHealth.js';
import { pickColor, suggestMarketCode, suggestRepId } from '../utils/autoColor.js';
import {
  isWorkerConfigured, workerHealth, workerUrl, addSubAccount,
} from '../utils/workerApi.js';

// Sub-Accounts panel.
// View mode:  live list of every connected (rep × market) pair with its
//             locationId, color, and health (live/idle/pending/error)
//             derived from data.json + snapshot errors[].
// Add mode:   form to wire up a new sub-account. Posts to the Cloudflare
//             Worker which holds the GitHub PAT server-side and does the
//             config + secret + deploy writes. No per-browser auth needed.
export default function SubAccountsPanel({ open, onClose, snapshotErrors }) {
  const [mode, setMode] = useState('view');     // 'view' | 'add'
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);   // { tone, text }

  useEffect(() => {
    if (!open) { setMode('view'); setStatus(null); return; }
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Sub-Accounts</h2>
            <p className="text-xs text-zinc-500 mt-1">
              {SUBACCOUNTS.length} connected · {REPO_OWNER}/{REPO_NAME}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 text-2xl leading-none -mt-1"
            aria-label="Close"
          >×</button>
        </div>

        {status && (
          <div className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm border ${TONES[status.tone] || TONES.zinc}`}>
            {status.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {mode === 'view' && (
            <ViewMode
              snapshotErrors={snapshotErrors}
              onAddClick={() => setMode('add')}
            />
          )}
          {mode === 'add' && (
            <AddMode
              busy={busy}
              setBusy={setBusy}
              setStatus={setStatus}
              setMode={setMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  rose:    'bg-rose-500/10 text-rose-300 border-rose-500/30',
  amber:   'bg-amber-500/10 text-amber-300 border-amber-500/30',
  blue:    'bg-blue-500/10 text-blue-300 border-blue-500/30',
  zinc:    'bg-zinc-800/40 text-zinc-300 border-zinc-700',
};

// --- VIEW MODE -----------------------------------------------------------

function ViewMode({ snapshotErrors, onAddClick }) {
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

      <AuthStatus />

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <div>Sub-account</div>
          <div className="text-right">Health</div>
        </div>
        <div className="divide-y divide-zinc-800/60">
          {rows.map(({ sa, rep, market, health }) => (
            <div key={sa.locationId} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 hover:bg-zinc-900/30 transition min-w-0">
              <div className="min-w-0 flex items-center gap-3">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: rep?.color || '#52525b' }} />
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: market?.color || '#52525b' }} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-zinc-100 truncate">
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

function AuthStatus() {
  const [worker, setWorker] = useState({ checking: true });
  useEffect(() => {
    if (!isWorkerConfigured()) { setWorker({ ok: false, reason: 'not_built_with_worker' }); return; }
    workerHealth().then(
      (h) => setWorker({ ok: true, version: h.version }),
      (err) => setWorker({ ok: false, reason: String(err.message || err) })
    );
  }, []);
  if (!isWorkerConfigured()) {
    return (
      <div className="px-4 py-3 rounded-lg text-xs border bg-amber-500/10 text-amber-300 border-amber-500/30">
        ⚠ Add button disabled — the Cloudflare Worker isn't deployed yet. Setup: <span className="font-mono">worker/README.md</span>.
        Once Ram deploys it and sets <span className="font-mono">VITE_WORKER_URL</span> + <span className="font-mono">VITE_WORKER_KEY</span> in GitHub Actions secrets, every browser can add sub-accounts.
      </div>
    );
  }
  if (worker.checking) {
    return <div className="px-4 py-3 rounded-lg text-xs border bg-zinc-800/40 text-zinc-300 border-zinc-700">Checking Worker…</div>;
  }
  if (worker.ok) {
    return (
      <div className="px-4 py-3 rounded-lg text-xs border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
        ✓ Worker connected — auth runs server-side, no token in this browser. Anyone with the dashboard can add a sub-account.
      </div>
    );
  }
  return (
    <div className="px-4 py-3 rounded-lg text-xs border bg-rose-500/10 text-rose-300 border-rose-500/30">
      ✗ Worker unreachable: {worker.reason}. <span className="text-zinc-400">{workerUrl()}</span>
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
      className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition truncate text-left"
      title="Copy location ID"
    >
      {locationId} {copied ? '✓ copied' : '⧉'}
    </button>
  );
}

// --- ADD MODE ------------------------------------------------------------

function AddMode({ busy, setBusy, setStatus, setMode }) {
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

  useEffect(() => {
    if (marketMode === 'new' && newMarketName && !newMarketCode) {
      setNewMarketCode(suggestMarketCode(newMarketName));
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
  const finalMarketId = marketMode === 'existing' ? marketId : (newMarketCode || suggestMarketCode(newMarketName));

  const canSubmit =
    isWorkerConfigured() &&
    locationId.trim().length >= 8 &&
    pitToken.trim().length >= 8 &&
    (repMode === 'existing' ? !!repId : newRepName.trim().length >= 2) &&
    (marketMode === 'existing' ? !!marketId : (newMarketName.trim().length >= 2 && (newMarketCode || '').length >= 2));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setStatus({ tone: 'blue', text: 'Calling Worker…' });
    try {
      const newMarket = marketMode === 'new'
        ? { id: finalMarketId, name: newMarketName.trim(), color: marketColor }
        : null;
      const newRep = repMode === 'new'
        ? { id: finalRepId, name: newRepName.trim(), color: repColor }
        : null;
      await addSubAccount({
        newMarket, newRep,
        subaccount: { repId: finalRepId, marketId: finalMarketId, locationId: locationId.trim() },
        pitToken: pitToken.trim(),
      });
      setStatus({
        tone: 'emerald',
        text: `Wired up ${finalRepId} · ${finalMarketId}. Deploy triggered — refresh the TV in ~3 min and the new sub-account will be live.`,
      });
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
        <button onClick={() => setMode('view')} className="text-xs text-zinc-500 hover:text-zinc-300 transition">← Back to list</button>
        <h3 className="text-base font-semibold text-zinc-100 mt-1">Add New Sub-Account</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Wires it into <span className="text-zinc-300">subaccounts.json</span>, writes the PIT to a per-location
          GitHub Secret, and triggers a deploy. The Worker handles all of it server-side.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (encrypted before storage)"
        />
      </Section>

      {!isWorkerConfigured() && (
        <div className="px-4 py-3 rounded-lg text-xs border bg-amber-500/10 text-amber-300 border-amber-500/30">
          The Worker isn't deployed yet — see <span className="font-mono">worker/README.md</span>. Form is disabled until it's live.
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
        <button onClick={() => setMode('view')} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-900 border border-zinc-800 transition">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit || busy}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            canSubmit && !busy
              ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {busy ? 'Adding…' : 'Add Sub-Account'}
        </button>
      </div>
    </div>
  );
}

const INPUT = 'w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition';

function Section({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-400">{label}</label>
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
    <div className="inline-flex rounded-md border border-zinc-800 overflow-hidden text-xs">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 transition ${
            value === o.id
              ? 'bg-zinc-800 text-zinc-100'
              : 'bg-zinc-950 text-zinc-500 hover:text-zinc-300'
          }`}
        >{o.label}</button>
      ))}
    </div>
  );
}

function ColorPreview({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
      <span className="w-4 h-4 rounded-full border border-zinc-700" style={{ background: color }} />
      <span className="truncate">{label} · <span className="font-mono text-zinc-400">{color}</span></span>
    </div>
  );
}
