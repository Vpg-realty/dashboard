-- Finance (Luke, Oct 15; owners only — see edge/finance.js). One row per
-- commission line that has moved past "owed": approved or paid. A line with
-- no row is owed (or, on a deal the sheet already marked "Commission paid",
-- settled in the sheet). Amounts are the deal's commission at approval /
-- payment; the live amount comes from the deal (src/finance/lines.js).
CREATE TABLE IF NOT EXISTS fin_payouts (
  deal_id TEXT NOT NULL,
  part TEXT NOT NULL,          -- acq | dispo | manager | override | tc
  who TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,        -- approved | paid
  approved_by TEXT,
  approved_at TEXT,
  paid_on TEXT,                -- YYYY-MM-DD
  method TEXT,                 -- ACH | CHECK | WIRE | ZELLE | OTHER
  ref TEXT,
  paid_by TEXT,
  paid_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (deal_id, part)
);

-- Payments toward a line (Luke, Oct 30: Zelle caps at $5k a day, so a
-- commission can go out in parts). One row per payment; `final` = the one
-- that paid the line off (the fin_payouts row turns paid with it). Undoing a
-- line's payment removes its final row; a partial one is removed by id.
-- Lines paid before Oct 30 have no rows here (their fin_payouts row is the
-- payment). Created by edge/finance.js `ensure` on first use.
CREATE TABLE IF NOT EXISTS fin_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,       -- as fin_payouts (an extra's id for other payments)
  part TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL,
  ref TEXT,
  paid_by TEXT,
  paid_at TEXT NOT NULL,
  final INTEGER NOT NULL DEFAULT 0
);

-- Other payments (Luke, Oct 30: "a general payment with a note as to what it
-- was and why"): a bonus or spiff not worked out from a deal. Approved and
-- paid like a commission (fin_payouts / fin_payments with deal_id = id,
-- part = 'extra'); `deal_id` here optionally names a deal it belongs to.
CREATE TABLE IF NOT EXISTS fin_extras (
  id TEXT PRIMARY KEY,         -- x<random>
  who TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT NOT NULL,
  deal_id TEXT,
  on_day TEXT NOT NULL,        -- YYYY-MM-DD, the date it's for (statements)
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
