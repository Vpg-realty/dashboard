-- Suggestion box (Luke, Oct 15): owners, managers and the TC suggest changes
-- to the site; owners review and decide. functions/api/suggestions.
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL,          -- fix | change | idea
  area TEXT,                   -- a sidebar section id, or 'other'
  page TEXT,                   -- the page it was suggested from
  status TEXT NOT NULL,        -- new | review | approved | done | declined
  created_by TEXT NOT NULL,
  created_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  note TEXT                    -- the owners' answer
);
CREATE TABLE IF NOT EXISTS suggestion_comments (
  id TEXT PRIMARY KEY,
  sid TEXT NOT NULL,
  body TEXT NOT NULL,
  by_name TEXT NOT NULL,
  by_email TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS suggestion_comments_sid ON suggestion_comments (sid);
