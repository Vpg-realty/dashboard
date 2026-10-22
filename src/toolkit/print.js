// "Download PDF" for a calculation: a clean page in a new window that opens
// the browser's print dialog (Save as PDF) — the same way Finance prints
// statements.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// sections = [{ title, rows: [[label, value, strong?]] }] ; table = { head, rows } (optional)
export function printCalc({ kind, title, opp, by, sections, table, note }) {
  const w = window.open('', '_blank');
  if (!w) return;
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' });
  const sec = (s) => `<section><h2>${esc(s.title)}</h2><table>${s.rows.map(([l, v, b]) => `<tr${b ? ' class="b"' : ''}><td>${esc(l)}</td><td class="n">${esc(v)}</td></tr>`).join('')}</table></section>`;
  const tbl = table ? `<section class="wide"><h2>${esc(table.title)}</h2><table class="grid"><tr>${table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${table.rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></section>` : '';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || kind)} · VPG</title><style>
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b;margin:32px;font-size:12.5px}
h1{font-size:20px;margin:0;color:#1b385f}.sub{color:#71717a;margin:4px 0 18px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}section{break-inside:avoid}section.wide{grid-column:1/-1}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#fff;background:#1b385f;margin:0;padding:6px 10px;border-radius:6px 6px 0 0}
table{width:100%;border-collapse:collapse;border:1px solid #e0d5c1}td,th{padding:5px 10px;border-top:1px solid #efe9dd;text-align:left}th{background:#f7f4ee;font-size:11px;color:#554b38}
.n{text-align:right;font-variant-numeric:tabular-nums}tr.b td{font-weight:700;color:#142a48;background:#f7f4ee}
.note{margin-top:16px;color:#71717a}.foot{margin-top:22px;color:#a1a1aa;font-size:11px}
</style></head><body>
<h1>Valley Property Group · ${esc(kind)}</h1><div class="sub">${esc(title || 'Untitled')}${opp ? ` · ${esc(opp)}` : ''}${by ? ` · by ${esc(by)}` : ''} · printed ${esc(today)}</div>
<div class="cols">${sections.map(sec).join('')}${tbl}</div>
${note ? `<div class="note">${esc(note)}</div>` : ''}
<div class="foot">From the VPG dashboard Toolkit.</div><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
