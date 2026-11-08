// Settings › Backups & Usage › Site Usage (Luke, Nov 8): what the site stores
// against what the Cloudflare plan includes (Workers Paid: R2 10 GB, D1 5 GB).
// Data: GET /api/usage (owners). Requests and row reads stay with
// `npm run usage` (they need the account's analytics, not the site).
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';
import Panel from '../shell/Panel.jsx';
import Tile from '../shell/Tile.jsx';

const GB = 1024 ** 3;
const R2_INCLUDED = 10 * GB;
const D1_INCLUDED = 5 * GB;
const size = (b) => (b == null ? '—' : b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const pct = (b, of) => (b == null ? '—' : `${((b / of) * 100).toFixed(b / of < 0.01 ? 2 : 1)}%`);

function Bar({ used, of }) {
  const w = used == null ? 0 : Math.max(0.5, Math.min(100, (used / of) * 100));
  return <div className="h-2 rounded-full bg-tan-100 overflow-hidden"><div className="h-full bg-navy-700" style={{ width: `${w}%` }} /></div>;
}

export default function UsageView() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { call('usage').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-rose-700 text-[14px]">{err}</p>;
  if (!d) return <p className="text-zinc-500 text-[14px]">Loading…</p>;
  const r2 = d.r2?.bytes ?? null;
  const total = (r2 || 0) + (d.d1?.bytes || 0);
  const rows = Object.entries(d.files || {}).filter(([, v]) => v.count);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile label="Everything Stored" dot="navy" value={size(total)} sub="files + database" />
        <Tile label="Files (R2)" dot="tan" value={size(r2)} sub={`${pct(r2, R2_INCLUDED)} of the 10 GB included`} />
        <Tile label="Database (D1)" dot="sky" value={size(d.d1?.bytes)} sub={`${pct(d.d1?.bytes, D1_INCLUDED)} of the 5 GB included`} />
        <Tile label="Deal Files" dot="green" value={size(d.dealFiles?.bytes)} sub={`${d.dealFiles?.count ?? 0} files on ${d.dealFiles?.deals ?? 0} deals`} />
      </div>
      <Panel title="Files by What They Are">
        <div className="px-6 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px] text-zinc-600"><span>All files</span><span className="tabular-nums">{size(r2)} of 10 GB</span></div>
            <Bar used={r2} of={R2_INCLUDED} />
          </div>
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-zinc-500"><th className="py-1.5">What</th><th className="text-right">Files</th><th className="text-right">Size</th><th className="text-right">Share</th></tr></thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-t border-tan-100"><td className="py-2 text-navy-800 font-medium">{k}</td><td className="text-right tabular-nums">{v.count.toLocaleString('en-US')}</td><td className="text-right tabular-nums">{size(v.bytes)}</td><td className="text-right tabular-nums text-zinc-500">{r2 ? `${Math.round((v.bytes / r2) * 100)}%` : '—'}</td></tr>
              ))}
              <tr className="border-t border-tan-100"><td className="py-2 text-navy-800 font-medium">Toolkit documents (in the database)</td><td className="text-right tabular-nums">{d.toolkit?.count ?? 0}</td><td className="text-right tabular-nums">{size(d.toolkit?.bytes)}</td><td className="text-right text-zinc-400">—</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Database">
        <div className="px-6 py-4 flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px] text-zinc-600"><span>{d.d1?.tables ?? '—'} tables — deals, alerts, scorecards, settings and the rest</span><span className="tabular-nums">{size(d.d1?.bytes)} of 5 GB</span></div>
          <Bar used={d.d1?.bytes} of={D1_INCLUDED} />
        </div>
      </Panel>
      <p className="text-[12.5px] text-zinc-500 max-w-3xl">The Cloudflare plan ($5 a month) includes 10 GB of files and 5 GB of database; past that, files cost about $0.015 per GB a month. Message history backups are never deleted; daily contact copies keep 14 days and weekly copies 8 weeks plus one a month for a year. Read {new Date(d.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' })} Arizona.</p>
    </div>
  );
}
