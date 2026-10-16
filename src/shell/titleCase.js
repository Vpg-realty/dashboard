// Proper case for every chart title and header (Luke, Oct 16: "chart titles
// or headers to be proper case throughout the whole site" — "How the company
// is looking" → "How the Company Is Looking"). Small words (a, an, and, &,
// as, at, by, for, in, of, on, or, per, the, to, vs) stay lower case unless
// first; a word that already has a capital (GHL, TC, COE, McKay, iPhone) or
// a digit / symbol in front is left as it is. Non-strings pass through.
const SMALL = new Set(['a', 'an', 'and', '&', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'vs.', 'via']);
export function titleCase(s) {
  if (typeof s !== 'string') return s;
  let first = true;
  return s.replace(/(\S+)/g, (w) => {
    const isFirst = first;
    first = /[·—:|]$/.test(w) || w === '·' || w === '—' || w === '–' || w === '|';
    if (w === '·' || w === '—' || w === '–' || w === '|') return w;
    if (/[A-Z]/.test(w) || !/^[a-z]/.test(w)) return w;
    if (!isFirst && SMALL.has(w)) return w;
    return w[0].toUpperCase() + w.slice(1);
  });
}
