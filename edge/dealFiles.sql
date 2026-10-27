-- A deal's files and Claude's review of them (Luke, Oct 27; edge/dealFiles.js).
-- Files go to R2 (binding FILES, bucket vpg-deal-files) once it's bound to the
-- Pages project; until then into D1 in base64 pieces (deal_file_chunks, 1.4 MB
-- of the file each). Each file remembers where it went (`store`).
CREATE TABLE IF NOT EXISTS deal_files (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  store TEXT NOT NULL DEFAULT 'd1',     -- 'r2' (bucket vpg-deal-files, key deals/<deal>/<id>) or 'd1' (deal_file_chunks)
  kind TEXT NOT NULL,
  kind_set INTEGER NOT NULL DEFAULT 0,  -- 1 = picked by a person (Claude leaves it alone)
  uploaded_by TEXT,
  uploaded_email TEXT,
  uploaded_at TEXT NOT NULL,
  read TEXT,                            -- what Claude read in it (JSON), once
  read_at TEXT,
  read_error TEXT
);
CREATE INDEX IF NOT EXISTS deal_files_deal ON deal_files (deal_id);
CREATE TABLE IF NOT EXISTS deal_file_chunks (
  file_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (file_id, n)
);
-- The deal's review: key information, what to check, missing documents and
-- the values Claude proposes (JSON), with the files it was built from.
CREATE TABLE IF NOT EXISTS deal_reviews (
  deal_id TEXT PRIMARY KEY,
  review TEXT NOT NULL,
  files TEXT NOT NULL,
  by_name TEXT,
  at TEXT NOT NULL
);
