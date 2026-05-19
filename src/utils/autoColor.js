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

// USPS 2-letter codes for US states/territories — the authoritative short
// code for any state name. VPG operates in US states so this is the first
// source of truth; we fall back to letter-slicing only for non-state names.
const USPS_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
  california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'puerto rico': 'PR',
};

// Suggest a 2-letter market code from a free-form name, never colliding
// with codes already taken. Tiers in order: USPS state code → first two
// letters → sliding pairs from the start → first letter + spare alphabet.
// Examples (with no collisions): "Missouri" → "MO", "Springfield" → "SP".
// With "MO" already taken: "Missouri" → "MS". With "MI" + "MO" + "MS"
// taken: "Missouri" → "MU".
export function suggestMarketCode(name, taken = []) {
  const normalized = String(name || '').trim().toLowerCase();
  const used = new Set((taken || []).map((c) => String(c).toUpperCase()));

  const usps = USPS_STATES[normalized];
  if (usps && !used.has(usps)) return usps;

  const letters = normalized.replace(/[^a-z]/g, '').toUpperCase();
  if (letters.length >= 2 && !used.has(letters.slice(0, 2))) return letters.slice(0, 2);

  if (letters.length >= 2) {
    for (let i = 1; i < letters.length; i++) {
      const candidate = letters[0] + letters[i];
      if (!used.has(candidate)) return candidate;
    }
  }

  const first = letters[0] || 'X';
  for (let c = 65; c <= 90; c++) {
    const candidate = first + String.fromCharCode(c);
    if (!used.has(candidate)) return candidate;
  }
  return first + 'X';
}

export function suggestRepId(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || `rep_${Date.now().toString(36).slice(-4)}`;
}
