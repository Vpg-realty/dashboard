// Just enough Markdown for Claude's chat answers: paragraphs, headings,
// bullet / numbered lists, simple tables, **bold** and `code`. Built as React
// elements (never raw HTML), so nothing in an answer can inject markup.
function inline(text, key = 0) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <strong key={`${key}-${m.index}`} className="font-semibold text-navy-900">{t.slice(2, -2)}</strong> : <code key={`${key}-${m.index}`} className="rounded bg-tan-100 px-1 text-[12.5px]">{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const [head, ...body] = cells;
      blocks.push(
        <div key={i} className="overflow-x-auto"><table className="text-[13px] border-collapse">
          <thead><tr>{head.map((c, j) => <th key={j} className="text-left font-semibold text-navy-800 px-2 py-1 border-b border-tan-200">{inline(c, j)}</th>)}</tr></thead>
          <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="px-2 py-1 border-b border-tan-100 align-top">{inline(c, j)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')); i++; }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={i} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-0.5`}>{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</Tag>);
      continue;
    }
    if (/^#{1,4}\s/.test(line)) { blocks.push(<div key={i} className="font-semibold text-navy-800 mt-1">{inline(line.replace(/^#+\s/, ''), i)}</div>); i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#{1,4}\s)/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={i}>{inline(para.join(' '), i)}</p>);
  }
  return <div className="flex flex-col gap-2 leading-relaxed">{blocks}</div>;
}
