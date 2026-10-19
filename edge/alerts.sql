-- Alerts (Luke, Oct 18: "an alerts section … tasks from GHL … leads
-- identified by Claude … a chime / red dot … the main daily page").
-- functions/api/alerts (logic edge/alerts.js); filled by people on the site
-- and by scripts/sync-alerts.mjs (GHL tasks, 30-day check-ins, leads).
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  ext_id TEXT UNIQUE,           -- ghl:<taskId> | checkin:<oppId>:<n> | lead:<messageId>; NULL for site tasks
  holder TEXT NOT NULL,         -- whose it is: a rep id, or u:<email name> for someone without one
  kind TEXT NOT NULL,           -- task | ghl | checkin | lead
  title TEXT NOT NULL,
  body TEXT,
  quote TEXT,                   -- leads: the agent's text
  sub TEXT,                     -- "<repId>|<marketId>" (GHL links)
  opp TEXT,                     -- GHL opportunity id
  conv TEXT,                    -- GHL conversation id
  contact TEXT,                 -- GHL contact id
  due TEXT,                     -- YYYY-MM-DD (Arizona)
  created_by TEXT,
  created_at TEXT NOT NULL,
  done_by TEXT,
  done_at TEXT,
  verdict TEXT,                 -- leads: real | not
  verdict_by TEXT,
  verdict_at TEXT,
  -- the property address a lead / same-address alert is about (Oct 19;
  -- added to the live table with ALTER TABLE alerts ADD COLUMN addr TEXT)
  addr TEXT
);
CREATE INDEX IF NOT EXISTS alerts_holder ON alerts (holder, done_at);
-- Oct 19: the sync and the red-dot poll scanned the whole table every time
-- and used up D1's free daily reads; these keep both to the open rows.
CREATE INDEX IF NOT EXISTS alerts_kind ON alerts (kind, done_at);
CREATE INDEX IF NOT EXISTS alerts_done ON alerts (done_at);
-- When each person last opened Alerts (the red dot = newer than this) and
-- whether they want the chime.
CREATE TABLE IF NOT EXISTS alert_seen (
  email TEXT PRIMARY KEY,
  seen_at TEXT,
  chime INTEGER NOT NULL DEFAULT 1
);
