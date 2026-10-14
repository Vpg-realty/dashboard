-- Deal tracker tables in D1 `vpg-dashboard` (created Oct 14; see edge/deals.js).
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deal_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,
  at TEXT NOT NULL,
  email TEXT,
  name TEXT,
  field TEXT NOT NULL,
  old TEXT,
  new TEXT
);
CREATE INDEX IF NOT EXISTS deal_log_deal ON deal_log (deal_id, at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);
-- GHL → tracker sync (edge/dealSync.js): which GHL opportunity feeds which
-- tracker deal, and the GHL values seen last run (JSON).
CREATE TABLE IF NOT EXISTS deal_ghl (
  ghl_id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  location TEXT,
  last TEXT,
  linked_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS deal_ghl_deal ON deal_ghl (deal_id);
