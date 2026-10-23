// The rep · sub-account box — "Sam · TN" in the rep's colour (Luke, Oct 22:
// Alerts; Oct 23: Home's Today at a Glance and Deals › Active use the same).
export default function RepTag({ label, color = '#64748b', className = '' }) {
  if (!label) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border-[1.5px] px-2 py-[1px] text-[12.5px] font-bold text-navy-900 bg-white whitespace-nowrap ${className}`} style={{ borderColor: color }}>
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
    </span>
  );
}
