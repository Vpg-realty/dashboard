// Small pieces shared by the Settings pages.
export function Section({ title, sub, children, right }) {
  return (
    <section className="rounded-xl border border-tan-200 bg-white p-5 shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <div className="flex items-start gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-navy-700">{title}</h2>
          {sub && <p className="text-zinc-500 text-[13px] mt-0.5 max-w-3xl">{sub}</p>}
        </div>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}
export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-zinc-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-zinc-400 mt-1">{hint}</span>}
    </label>
  );
}
export const inputCls = 'h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-navy-100 focus:border-navy-200';
export function Pct({ value, onChange }) {
  return (
    <div className="relative">
      <input type="number" step="0.1" min="0" max="100" value={value == null ? '' : Math.round(value * 1000) / 10} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value) / 100)} className={`${inputCls} pr-7 tabular-nums`} />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">%</span>
    </div>
  );
}
export function Money({ value, onChange }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
      <input type="number" step="1" min="0" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className={`${inputCls} pl-6 tabular-nums`} />
    </div>
  );
}
export function SaveBar({ dirty, busy, msg, onSave, onReset, label = 'Save changes' }) {
  if (!dirty && !msg) return null;
  return (
    <div className="sticky bottom-0 mt-5 -mx-1 flex items-center gap-3 rounded-xl border border-tan-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
      <span className={`flex-1 text-[13px] ${msg?.error ? 'text-red-700' : 'text-zinc-600'}`}>{msg?.text || 'Unsaved changes'}</span>
      {dirty && <button onClick={onReset} className="h-9 px-3 rounded-lg border border-zinc-200 bg-white font-medium">Discard</button>}
      {dirty && <button onClick={onSave} disabled={busy} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : label}</button>}
    </div>
  );
}
