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
-- The TC List (src/deals/tcList.js, functions/api/tc): checklist items
-- ticked per deal, and tasks added to a deal for the TC.
CREATE TABLE IF NOT EXISTS tc_checks (
  deal_id TEXT NOT NULL,
  item TEXT NOT NULL,
  done_by TEXT NOT NULL,
  done_at TEXT NOT NULL,
  PRIMARY KEY (deal_id, item)
);
CREATE TABLE IF NOT EXISTS tc_tasks (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  text TEXT NOT NULL,
  due TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  done_by TEXT,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS tc_tasks_deal ON tc_tasks (deal_id);
-- Flag an Issue on the TC List (Luke, Oct 26): a title problem, a quiet
-- seller / buyer, a COE that needs to move … Each one makes an Alerts task for
-- the owners and the deal's acq rep and dispo rep (ext_id
-- tcissue:<id>:<holder>), closed when the issue is resolved.
CREATE TABLE IF NOT EXISTS tc_issues (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS tc_issues_deal ON tc_issues (deal_id);

-- Changes made on the site to the four fields GHL shares with the tracker
-- (Luke, Oct 18: property address, title / escrow, COE, IP end) wait here
-- until scripts/push-ghl.mjs (every deploy, ~15 min) writes them to the
-- linked GHL opportunity. status: pending | done | failed.
CREATE TABLE IF NOT EXISTS ghl_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,
  ghl_id TEXT NOT NULL,
  location TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT,
  by_name TEXT,
  at TEXT NOT NULL,
  status TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS ghl_push_status ON ghl_push (status);
