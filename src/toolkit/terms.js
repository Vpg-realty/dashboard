// Contract terms by state (Luke, Nov 3: "a catalogue of specific needs to
// each state's contract — what additional terms we need, what boxes must be
// checked for assignment, if off market we need this term"). The offer
// templates add the terms that apply to the deal (state + listed or not), and
// Toolkit › Contract Terms shows the catalogue; owners edit it (saved in D1
// settings `contract_terms`, edge/toolkit.js — this file is only the start).
//
// Seeded from Luke's own terms (Nov 3) and his contract-review notes (the
// Claude skill "real-estate-contract-review": the AL ¶30 box, NC's consent of
// all parties, GA's consent "withheld for any reason or no reason", the forms
// that document a seller-paid commission). The inspection clause's states are
// Luke's list, still to confirm against the contracts (`confirm`).
import { ABBR, NAME_OF } from './states.js';

// when: 'always' (every contract), 'offmarket' (the property isn't listed),
// 'states' (only those states), 'optional' (ticked by hand).
export const WHEN = {
  always: 'Every contract',
  offmarket: 'If off market (not listed)',
  states: 'Only in these states',
  optional: 'When needed (tick it)',
};

export const DEFAULT_TERMS = {
  terms: [
    {
      id: 'investor', when: 'always', title: 'Investment buyer',
      text: 'Buyer intends to acquire legal and equitable title for a profit. Seller understands that buyer is classified as an investment buyer agreeing to purchase this property to rent, lease, assign, or flip for a profit. It is further understood that the buyer has no intent to occupy property as primary residence.',
    },
    {
      id: 'weekend', when: 'always', title: 'Weekend or holiday',
      text: 'If the last day of the inspection period should fall on a weekend or federal holiday, inspection period to end the following business day by 11:59PM.',
    },
    {
      id: 'offmarket', when: 'offmarket', title: 'Off market during the inspection period',
      text: 'Seller agrees that the Property shall remain off-market and shall not be listed, marketed, advertised, shown, or otherwise offered for sale through the MLS or any other public or private marketing channel during the mutually agreed-upon Inspection/Due Diligence Period. Seller shall not solicit or accept backup offers during such period without Buyer’s prior written consent.',
    },
    {
      id: 'informal', when: 'states', states: ['IN', 'OH', 'TN', 'AL', 'NV', 'OK', 'MO'], confirm: true, title: 'Informal inspection',
      text: 'Seller hereby accepts that Buyer may evaluate the Property through an informal inspection process, which may include a drive-by, visual inspection from the exterior or through windows, entry into the Property, and/or evaluation by Buyer’s contractor or representative. Buyer is not required to obtain a professional inspection or provide a written list of defects, repairs, or disapproved items. Buyer may terminate this Agreement during the Inspection/Due Diligence Period if, in Buyer’s judgment, the Property does not meet Buyer’s investment criteria, and such termination shall not require Buyer to identify or document any specific defect or condition.',
    },
    {
      id: 'assign', when: 'states', states: ['NC', 'GA'], title: 'Assignment',
      text: 'Buyer and seller hereby agree that this contract is fully assignable by Buyer. Seller agrees Buyer is an investment buyer who intends to assign or resell for profit. This provision controls over any conflicting language in this contract.',
    },
  ],
  // What to check on each state's contract — not terms to add, notes to read.
  states: {
    AL: ['AL REALTORS form, paragraph 30: the assignment box must be checked — left blank, the contract is NOT assignable.', 'Offers here go out without “and/or Assigns” on the signer line.'],
    AZ: ['Offers here go out without “and/or Assigns” on the signer line.'],
    FL: ['Offers here go out without “and/or Assigns” on the signer line.'],
    OK: ['Offers here go out without “and/or Assigns” on the signer line.'],
    NC: ['NC Form 2-T: assignment needs the consent of all parties — add the assignment term.', 'A seller-paid commission needs the Buyer Agent Compensation addendum attached.'],
    GA: ['GAR F201: the seller can withhold consent to assign “for any reason or no reason” — put the assignment term in the Special Stipulations.', 'A seller-paid commission needs F255 / F259 attached.'],
    SC: ['SCAR 310: a seller-paid commission needs Form 120 attached.', 'Check the packet for a buyer-broker agreement (Form 136) — exclusive or not, and its fee.'],
    NM: ['NMAR 5101 / 2300: read every addendum — custom terms go in the Additional Provisions.'],
  },
};

const code = (s) => ABBR[s] || String(s || '').toUpperCase();

// The terms that apply to a deal: every-contract ones, off-market ones when
// it isn't listed (listed === 'no'), and the state's own. Optional ones only
// when picked (`picked` = ids).
export function termsFor(store, { state, listed, picked = [] } = {}) {
  const st = code(state);
  return (store?.terms || DEFAULT_TERMS.terms).filter((t) => (
    t.when === 'always'
    || (t.when === 'offmarket' && listed === 'no')
    || (t.when === 'states' && st && (t.states || []).includes(st))
    || (t.when === 'optional' && picked.includes(t.id))
  ));
}
export const stateNotes = (store, state) => (store?.states || DEFAULT_TERMS.states)[code(state)] || [];
export const stateName = (c) => NAME_OF[c] || c;

// Owners' edits are checked on the server before saving.
export function checkTerms(v) {
  if (!v || !Array.isArray(v.terms) || typeof v.states !== 'object' || Array.isArray(v.states)) return 'Bad catalogue';
  if (v.terms.length > 60) return 'Too many terms';
  const ids = new Set();
  for (const t of v.terms) {
    if (!t || !/^[\w-]{1,40}$/.test(String(t.id || ''))) return 'A term is missing its id';
    if (ids.has(t.id)) return `Two terms share the id ${t.id}`;
    ids.add(t.id);
    if (!WHEN[t.when]) return `Pick when “${t.title || t.id}” applies`;
    if (!String(t.title || '').trim() || String(t.title).length > 80) return 'Every term needs a short name';
    if (!String(t.text || '').trim() || String(t.text).length > 3000) return `“${t.title}” needs its wording (up to 3,000 characters)`;
    if (t.when === 'states' && (!Array.isArray(t.states) || !t.states.length || t.states.some((s) => !/^[A-Z]{2}$/.test(s)))) return `Pick the states for “${t.title}”`;
  }
  for (const [s, notes] of Object.entries(v.states)) {
    if (!/^[A-Z]{2}$/.test(s) || !Array.isArray(notes) || notes.length > 20 || notes.some((n) => typeof n !== 'string' || n.length > 600)) return `Check the notes for ${s}`;
  }
  return null;
}
