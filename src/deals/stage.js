// What the Assigned / Closed pop-ups ask (StageDialog.jsx, Luke Oct 26).
import { FIELD, isBlank, stageOf } from './math.js';
import { canFill } from './required.js';
import { vpgPlaced } from './cancel.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
const sold = (v) => !isBlank(v) && !(typeof v === 'number' && v <= 0);

// What each stage asks, in groups. `need` = counts as missing when blank;
// `show` = asked only when it applies.
export const STAGE_ASKS = {
  ASSIGNED: {
    word: 'Assigned', verb: 'Mark Assigned', keep: 'Keep it as it is',
    blurb: 'Fill in the sale. Anything you leave blank stays on Needs Info.',
    groups: [
      { label: 'Selling It', keys: ['dispoMember', 'buyer', 'asking', 'vpgAssign', 'finalAssign'] },
      { label: "Buyer's Earnest Money", keys: ['emdPaidBy', 'buyerEmd'] },
      { label: 'Closing', keys: ['coe', 'title'] },
    ],
    need: ['dispoMember', 'buyer', 'vpgAssign', 'finalAssign', 'emdPaidBy', 'coe', 'title'],
  },
  COMPLETE: {
    word: 'Closed', verb: 'Mark Closed', keep: 'Keep it open',
    blurb: 'Fill in the closing. Anything you leave blank stays on Needs Info.',
    groups: [
      { label: 'The Sale', keys: ['coe', 'dispoMember', 'buyer', 'vpgAssign', 'finalAssign'] },
      { label: 'Costs', keys: ['addlFees', 'closingCosts'] },
      { label: 'Money In', keys: ['wireReceived', 'wireDate', 'emdReturned', 'emdLostWhy'] },
      { label: 'Commissions', keys: ['commPaid'] },
    ],
    need: ['coe', 'dispoMember', 'buyer', 'vpgAssign', 'finalAssign', 'wireReceived', 'wireDate', 'emdReturned', 'emdLostWhy', 'commPaid'],
    show: {
      closingCosts: (d) => up(d.dealType) === 'DOUBLE CLOSE' || !isBlank(d.closingCosts),
      emdReturned: (d) => vpgPlaced(d),
      emdLostWhy: (d) => up(d.emdReturned) === 'LOST',
    },
  },
};

// Does setting the stage to `to` open the pop-up? Only moving forward into
// Assigned (from Under Contract / Dispo Active) or into Closed.
export function asksStage(d, to) {
  const t = up(to), from = stageOf(d);
  if (t === 'ASSIGNED') return ['UNDER_CONTRACT', 'DISPO_ACTIVE', 'PENDING'].includes(from);
  if (t === 'COMPLETE') return from !== 'COMPLETE';
  return false;
}

export const missingOf = (d, k) => (k === 'vpgAssign' || k === 'finalAssign' ? !sold(d[k]) : k === 'emdPaidBy' ? isBlank(d[k]) || up(d[k]) === 'PENDING' : isBlank(d[k]));

// The fields this person is asked for this stage (on deal `d`).
export function stageKeys(stage, d, owner) {
  const ask = STAGE_ASKS[stage];
  return ask.groups.map((g) => ({ ...g, keys: g.keys.filter((k) => FIELD[k] && canFill(k, { owner, readOnly: false }) && (!ask.show?.[k] || ask.show[k](d))) })).filter((g) => g.keys.length);
}

