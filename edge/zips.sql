-- Zip center (Luke, Oct 14). One row per zip from the territory sheet; who
-- holds which zip and since when; every request. Rules live in settings
-- 'zip_rules', each state's round in settings 'zip_rounds' (edge/zips.js).
-- zips: tier = the zip's own population tier (1: 20k+, 2: 8k–20k, 3: under
--   8k); untiered = the sheet gave no tier (counted as tier 3); curated = a
--   hand-picked list (Idaho, Virginia), counted as tier 1. status active /
--   paused / excluded. last_round = the last round it was handed out in (a
--   zip is "used" this round when last_round >= the state's round). flag =
--   bad data reported by a rep or owner (skipped until an owner clears it).
--   county_rank = the county's place in its state on the sheet (biggest first).
--   sheet_for / sheet_pulled = the sheet's "data last pulled for" (reference).
CREATE TABLE IF NOT EXISTS zips (
  zip TEXT PRIMARY KEY, state TEXT NOT NULL, county TEXT NOT NULL,
  county_tier INTEGER, county_rank INTEGER, tier INTEGER NOT NULL,
  untiered INTEGER NOT NULL DEFAULT 0, curated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', last_round INTEGER NOT NULL DEFAULT 0,
  flag TEXT, flag_note TEXT, flag_by TEXT, flag_at TEXT,
  sheet_for TEXT, sheet_pulled TEXT, note TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS zips_state ON zips (state, tier);
-- A hold: one zip given to one rep for holdDays. released_at set when it
-- expires (release_reason 'expired'), is released, or reused.
CREATE TABLE IF NOT EXISTS zip_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, zip TEXT NOT NULL, state TEXT NOT NULL,
  rep_id TEXT NOT NULL, round INTEGER NOT NULL, assigned_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, via TEXT NOT NULL, by_name TEXT, request_id TEXT,
  released_at TEXT, released_by TEXT, release_reason TEXT
);
-- No zip is ever held by two people at once.
CREATE UNIQUE INDEX IF NOT EXISTS zip_held_once ON zip_assignments (zip) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS zip_assignments_rep ON zip_assignments (rep_id, released_at);
-- via 'request' (a rep's automatic request — counts toward the weekly limit)
-- or 'owner' (an owner assigned specific zips).
CREATE TABLE IF NOT EXISTS zip_requests (
  id TEXT PRIMARY KEY, rep_id TEXT NOT NULL, state TEXT NOT NULL, at TEXT NOT NULL,
  asked INTEGER NOT NULL, given INTEGER NOT NULL, via TEXT NOT NULL,
  by_email TEXT, by_name TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS zip_requests_rep ON zip_requests (rep_id, at);
