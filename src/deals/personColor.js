// A person's colour: reps use their board colour, anyone else (dispo team,
// owners) a steady colour from the shared palette.
import { REPS } from '../data/config.js';
import { pickColor } from '../utils/autoColor.js';

const byName = new Map(REPS.map((r) => [r.name.toLowerCase(), r.color]));
const byFirst = new Map(REPS.map((r) => [r.name.split(' ')[0].toLowerCase(), r.color]));
export function personColor(name) {
  const n = String(name || '').trim().toLowerCase();
  return byName.get(n) || byFirst.get(n) || pickColor(n, REPS.map((r) => r.color));
}
