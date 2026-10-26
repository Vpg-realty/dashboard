-- Who can use the dashboard (Settings › People; edge/auth.js reads it).
-- Oct 19 (Luke's site map): Role + Status — status 'active' or 'inactive'
-- (an inactive person can't sign in, keeps their history), with the dates
-- they started and finished. A trainee is role 'trainee' (shown as
-- Acquisitions · Training). The old CHECK on role (no 'trainee') is gone;
-- edge/settings.js cleanUser checks roles.
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  rep_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  start_date TEXT,
  end_date TEXT,
  -- Oct 26 (Luke: "a first and last name option … use only the first name
  -- in the code"): `name` is the first name everywhere on the site; the
  -- last name is kept here for Settings › Team (ALTER TABLE on live D1).
  last_name TEXT
);
