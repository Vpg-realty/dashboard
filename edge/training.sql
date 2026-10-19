-- New-hire training (Luke, Oct 19): the program lives in settings
-- 'training_program' (steps, videos, test questions — never in the public
-- repo); these tables hold each trainee's progress. functions/api/training.
CREATE TABLE IF NOT EXISTS training_people (
  email TEXT PRIMARY KEY,         -- the trainee's login (users.email, role trainee)
  trainer TEXT,                   -- pod lead's rep id: their manager, trainer and shadow rep
  start_date TEXT,                -- YYYY-MM-DD
  created_by TEXT,
  created_at TEXT NOT NULL,
  graduated_at TEXT,
  graduated_by TEXT
);
CREATE TABLE IF NOT EXISTS training_progress (
  email TEXT NOT NULL,
  step TEXT NOT NULL,             -- the program step id
  status TEXT,                    -- paperwork: sent | signed
  done_by TEXT,
  done_at TEXT,
  score REAL,                     -- tests: best passing score 0–1
  rating INTEGER,                 -- sessions: 1–5 (owners / managers only)
  note TEXT,                      -- sessions: trainer's note (owners / managers only)
  PRIMARY KEY (email, step)
);
CREATE TABLE IF NOT EXISTS training_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  step TEXT NOT NULL,
  at TEXT NOT NULL,
  score REAL NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  wrong TEXT                      -- JSON: question numbers missed
);
CREATE INDEX IF NOT EXISTS training_attempts_email ON training_attempts (email, step);
-- Daily logs: shadow-day takeaways, Week 2 message counts.
CREATE TABLE IF NOT EXISTS training_logs (
  email TEXT NOT NULL,
  step TEXT NOT NULL,
  text TEXT,
  messages INTEGER,
  at TEXT NOT NULL,
  PRIMARY KEY (email, step)
);
-- Trainer notes: owners and managers only, never shown to the trainee.
CREATE TABLE IF NOT EXISTS training_notes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  by_name TEXT NOT NULL,
  at TEXT NOT NULL,
  text TEXT NOT NULL
);
