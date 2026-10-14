-- Territory (Luke, Oct 14): the "VPG_Territory_Tracker" Google Sheet in D1.
-- terr_states: one row per state — legal status, winter risk, county / zip
--   counts and tiers, staffing (projected reps, status, notes), the sheet's
--   rep slots, dispo coverage (JSON in `data`).
-- terr_counties: one row per county — tier, cities, zips (all and by tier),
--   assigned to, status, data last pulled, pulled for, notes.
CREATE TABLE IF NOT EXISTS terr_states (state TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT);
CREATE TABLE IF NOT EXISTS terr_counties (id INTEGER PRIMARY KEY AUTOINCREMENT, state TEXT NOT NULL, county TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT, UNIQUE (state, county));
CREATE INDEX IF NOT EXISTS terr_counties_state ON terr_counties (state);
