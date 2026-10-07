// States no longer carry their own colours (Luke, Oct 7: 26 saturated rep +
// state colours read as "clown-like"). Wherever a chart splits a rep by
// market, each market segment is a tint of that rep's colour — darkest for
// the rep's first market, lighter for each next one — and is labelled with
// its state code. Everywhere a state appears on its own (cards, lists,
// headers) it gets this neutral dot instead of a colour.

import { MARKETS } from '../data/config.js';

export const STATE_DOT = '#a1a1aa';

// Fraction of white mixed in per market position within a rep.
const TINT_STEPS = [0, 0.3, 0.5, 0.64, 0.74, 0.82];

const toRgb = (hex) => {
  const h = String(hex || '#a1a1aa').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

export function marketShade(repColor, index) {
  const t = TINT_STEPS[Math.min(index, TINT_STEPS.length - 1)];
  const [r, g, b] = toRgb(repColor).map((c) => Math.round(c + (255 - c) * t));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// Ink for a label sitting on a shade: white on dark fills, near-black on
// light ones (WCAG relative luminance, 0.3 cut-off picked so mid-tone rep
// colours like blue and green get white and yellow/pink tints get dark).
export function inkOn(fill) {
  const [r, g, b] = toRgb(fill).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#18181b' : '#ffffff';
}

// Fill for one market's segment in a rep's stacked bar: the rep's colour,
// tinted by the market's position among that rep's markets in configured
// market order — the order bars stack in — so every bar runs darkest at the
// bottom to lightest at the top.
export function segmentFill(rep, marketId) {
  const order = MARKETS.map((m) => m.id).filter((id) => rep?.markets?.includes(id));
  return marketShade(rep?.color, Math.max(0, order.indexOf(marketId)));
}
