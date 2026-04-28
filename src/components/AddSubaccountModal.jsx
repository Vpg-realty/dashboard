import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vpg_pending_subaccounts';

export default function AddSubaccountModal({ open, onClose }) {
  const [locationId, setLocationId] = useState('');
  const [pitToken, setPitToken] = useState('');
  const [repName, setRepName] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    if (open) {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setSaved(stored);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const canSave = locationId.trim().length >= 6 && pitToken.trim().length >= 8 && repName.trim().length >= 2;

  const save = () => {
    if (!canSave) return;
    const entry = {
      id: `sub_${Date.now()}`,
      locationId: locationId.trim(),
      pitToken: pitToken.trim().slice(0, 6) + '••••••••' + pitToken.trim().slice(-4),
      repName: repName.trim(),
      addedAt: new Date().toISOString(),
    };
    const next = [entry, ...saved];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(next);
    setLocationId('');
    setPitToken('');
    setRepName('');
  };

  const remove = (id) => {
    const next = saved.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Add Subaccount</h2>
            <p className="text-xs text-zinc-500 mt-1">Connect a GoHighLevel subaccount to the dashboard</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 text-2xl leading-none -mt-1"
            aria-label="Close"
          >×</button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <Field
            label="Rep / Subaccount Name"
            value={repName}
            onChange={setRepName}
            placeholder="e.g. Patrick Jeffries — Georgia"
          />
          <Field
            label="Location ID"
            value={locationId}
            onChange={setLocationId}
            placeholder="e.g. ve9EPM428h8vShlRW1KT"
            mono
          />
          <Field
            label="Private Integration Token (PIT)"
            value={pitToken}
            onChange={setPitToken}
            placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            mono
            type="password"
          />

          {/* Tutorial toggle */}
          <button
            onClick={() => setShowTutorial((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition text-blue-300"
          >
            <span className="flex items-center gap-2">
              <span className="text-lg leading-none">📘</span>
              <span className="text-sm font-medium">How do I get a Location ID + PIT?</span>
            </span>
            <span className={`text-lg leading-none transition ${showTutorial ? 'rotate-180' : ''}`}>⌄</span>
          </button>

          {showTutorial && <Tutorial />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">
            {saved.length} subaccount{saved.length === 1 ? '' : 's'} saved
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-900 border border-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                canSave
                  ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              }`}
            >
              Save Subaccount
            </button>
          </div>
        </div>

        {/* Saved list */}
        {saved.length > 0 && (
          <div className="px-6 pb-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-2">Saved Subaccounts</div>
            <div className="space-y-1.5">
              {saved.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-100 truncate">{s.repName}</div>
                    <div className="text-[11px] text-zinc-500 font-mono truncate">
                      {s.locationId} · {s.pitToken}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(s.id)}
                    className="text-xs text-zinc-500 hover:text-rose-400 px-2 py-1 transition shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, mono, type = 'text' }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function Tutorial() {
  return (
    <div className="rounded-lg bg-zinc-950 border border-blue-500/20 p-5 space-y-5 text-sm text-zinc-300">
      <Step n={1} title="Get the Location ID">
        <ol className="space-y-1.5 text-xs text-zinc-400 list-decimal pl-5">
          <li>Log into GoHighLevel and switch to the subaccount you want to track</li>
          <li>Go to <span className="text-zinc-200">Settings → Business Profile</span> (or Company Info)</li>
          <li>Copy the <span className="text-zinc-200">Location ID</span> shown at the top of the page</li>
          <li>It looks like a string of 20 letters and numbers</li>
        </ol>
      </Step>

      <Step n={2} title="Create a Private Integration Token (PIT)">
        <ol className="space-y-1.5 text-xs text-zinc-400 list-decimal pl-5">
          <li>Inside the same subaccount, go to <span className="text-zinc-200">Settings → Private Integrations</span></li>
          <li>Click <span className="text-zinc-200">+ Create new private integration</span></li>
          <li>Name it <span className="text-zinc-200">"VPG Dashboard"</span></li>
          <li>
            Select these scopes (read-only is fine):
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[
                'opportunities.readonly',
                'contacts.readonly',
                'conversations.readonly',
                'locations.readonly',
                'pipelines.readonly',
              ].map((s) => (
                <code key={s} className="px-1.5 py-0.5 rounded bg-zinc-900 text-[10px] text-blue-300 border border-zinc-800">{s}</code>
              ))}
            </div>
          </li>
          <li>Click create — copy the token <span className="text-amber-400">immediately</span> (you only see it once)</li>
        </ol>
      </Step>

      <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300">
        ⚠️ The PIT only shows up once. If you lose it, you'll need to create a new one.
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
        <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
      </div>
      {children}
    </div>
  );
}
