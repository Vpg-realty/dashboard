// Weekly score line chart (Scorecard Trends, Rep progress): lines over the
// Strong / Watch / Behind bands, drawn at the box's real pixel size.
import { useEffect, useRef, useState } from 'react';

// Size of a box in pixels, so the chart draws at its real size (no
// stretched text).
function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// Team / pod lines over the weeks, with the 90 and 75 band lines.
export default function LineChart({ labels, series, autoFrom }) {
  const [ref, { w: W, h: H }] = useSize();
  const L = 30, R = 20, B = 22;
  const T = series.some((s) => s.showValues) ? 22 : 8;
  const x = (i) => L + (labels.length < 2 ? (W - L - R) / 2 : (i / (labels.length - 1)) * (W - L - R));
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const lo = Math.max(0, Math.min(30, Math.floor((Math.min(100, ...all) - 5) / 10) * 10));
  const y = (v) => T + (1 - (v - lo) / (100 - lo)) * (H - T - B);
  if (!W || !H) return <div ref={ref} className="w-full h-full" />;
  return (
    <div ref={ref} className="w-full h-full">
    <svg width={W} height={H} className="block">
      <rect x={L} y={y(100)} width={W - L - R} height={y(90) - y(100)} fill="#ecfdf5" />
      <rect x={L} y={y(90)} width={W - L - R} height={y(75) - y(90)} fill="#fffbeb" />
      <rect x={L} y={y(75)} width={W - L - R} height={y(lo) - y(75)} fill="#fff1f2" />
      {[100, 90, 75, 50, 25].filter((v) => v >= lo).map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e4e4e7" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#71717a">{v}</text>
        </g>
      ))}
      {autoFrom != null && autoFrom > 0 && (
        <g>
          <line x1={(x(autoFrom - 1) + x(autoFrom)) / 2} x2={(x(autoFrom - 1) + x(autoFrom)) / 2} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="4 3" />
          <text x={(x(autoFrom - 1) + x(autoFrom)) / 2 + 5} y={T + 11} fontSize="11" fill="#64748b">auto CRM →</text>
        </g>
      )}
      {labels.map((l, i) => <text key={l} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="#52525b">{l}</text>)}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(Math.max(lo, v))])).filter(Boolean);
        return (
          <g key={s.name}>
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={s.bold ? 4 : 2.5} strokeDasharray={s.dash ? '7 5' : undefined} strokeLinejoin="round" />
            {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={s.bold ? 4.5 : 3.5} fill={s.color} />)}
            {s.showValues && s.values.map((v, i) => (v == null ? null : (
              <text key={`v${i}`} x={x(i)} y={y(Math.max(lo, v)) - 10} textAnchor="middle" fontSize="13" fontWeight="800" fill={s.color}>{Math.round(v)}</text>
            )))}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

