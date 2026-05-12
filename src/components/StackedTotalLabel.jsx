// Recharts <Customized> component that draws a total label above every
// stacked bar in a BarChart — regardless of which segment is non-zero.
// Plain LabelList on a single Bar skips rows where that Bar's segment value
// is 0, so reps with no value in the last-iterated market never got a total
// (Luke flagged this on Revenue + Agent Confirmed, May 12).
export default function StackedTotalLabel({ formattedGraphicalItems, format }) {
  if (!Array.isArray(formattedGraphicalItems) || !formattedGraphicalItems.length) return null;

  // Aggregate every Bar series' data into per-category totals and the
  // top y-coordinate of the stack.
  const acc = new Map();
  for (const item of formattedGraphicalItems) {
    const data = item?.props?.data;
    if (!Array.isArray(data)) continue;
    for (const d of data) {
      const key = d?.payload?._tk ?? d?.payload?.rep ?? d?.payload?.label;
      if (key == null) continue;
      const cur = acc.get(key) || { x: d.x, width: d.width, total: 0, top: Infinity };
      cur.total += Number(d.value) || 0;
      if (typeof d.y === 'number' && d.y < cur.top) cur.top = d.y;
      if (typeof d.x === 'number') cur.x = d.x;
      if (typeof d.width === 'number') cur.width = d.width;
      acc.set(key, cur);
    }
  }

  return (
    <g>
      {[...acc.values()].map((row, i) =>
        row.total > 0 && Number.isFinite(row.top) ? (
          <text
            key={i}
            x={row.x + row.width / 2}
            y={row.top - 6}
            fill="#e4e4e7"
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
          >
            {format ? format(row.total) : row.total}
          </text>
        ) : null
      )}
    </g>
  );
}
