// Deterministic color assignment for new markets / reps added via the
// Sub-Accounts panel. Same input → same color, every build, every reload.
// Seeded so we never accidentally collide with the explicit colors already
// baked into subaccounts.json for the original 7 markets and 5 reps.

const PALETTE = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#a855f7', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#eab308', // yellow
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
  '#22c55e', // green
  '#d946ef', // fuchsia
  '#0ea5e9', // sky
  '#facc15', // amber-bright
  '#8b5cf6', // violet
  '#f43f5e', // rose
];

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Pick a palette color for `id`, skipping any colors already used by `taken`
// (the existing markets/reps). Falls back to hash-based pick when every
// palette color is taken.
export function pickColor(id, taken = []) {
  const used = new Set((taken || []).map((c) => String(c).toLowerCase()));
  const available = PALETTE.filter((c) => !used.has(c.toLowerCase()));
  const pool = available.length ? available : PALETTE;
  return pool[hash(String(id)) % pool.length];
}

// Slugify a free-form name into a stable id. "Missouri" → "MO" for 2-char
// market codes, "New Rep Name" → "new_rep_name" for rep ids.
export function suggestMarketCode(name) {
  const cleaned = String(name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  return (cleaned + 'X').slice(0, 2);
}

export function suggestRepId(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || `rep_${Date.now().toString(36).slice(-4)}`;
}
