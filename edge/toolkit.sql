-- Toolkit (Luke, Oct 22): documents and calculators for everyone.
-- functions/api/toolkit, logic in edge/toolkit.js.

-- Proof of funds letters: the first is row 'pof', more are 'pof:<id>'
-- (Nov 3); `label` = its name (added Nov 3 with ALTER TABLE). Replacing a
-- letter replaces its row only. data = base64 of the PDF.
CREATE TABLE IF NOT EXISTS toolkit_files (
  name TEXT PRIMARY KEY,
  label TEXT,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  expires TEXT,                -- YYYY-MM-DD
  uploaded_by TEXT NOT NULL,
  uploaded_email TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);

-- Title agencies by market. state = full state name, or 'Other' for
-- "All other states". preferred = the one to use first in that state.
CREATE TABLE IF NOT EXISTS title_agencies (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  preferred INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS title_agencies_state ON title_agencies (state);

-- Saved calculations. kind = seller | mf. inputs = the calculator's fields,
-- summary = the headline result when saved (for the list). opp = the GHL
-- opportunity it's linked to ({id, label, sub}), or null.
CREATE TABLE IF NOT EXISTS calcs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  inputs TEXT NOT NULL,
  summary TEXT,
  opp TEXT,
  rep_id TEXT,
  by_name TEXT NOT NULL,
  by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS calcs_email ON calcs (by_email);
