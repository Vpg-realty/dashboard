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
