-- Closed deals map (Deals › Map; Luke, Oct 15). One row per closed sale:
-- the history sheet's sales (source 'sheet', imported once) and every deal
-- closed in the tracker since (source 'tracker', added by
-- scripts/closed-map.mjs on each deploy). lat / lng come from the US Census
-- geocoder in that script; geo = 'ok' | 'miss' (not found) | NULL (not tried).
CREATE TABLE IF NOT EXISTS closed_map (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  addr_key TEXT,
  sold TEXT,
  price REAL,
  source TEXT NOT NULL,
  deal_id TEXT,
  lat REAL,
  lng REAL,
  geo TEXT,
  geo_at TEXT
);
CREATE INDEX IF NOT EXISTS closed_map_key ON closed_map (addr_key);
