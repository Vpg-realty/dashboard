-- Owners' Claude chat (Luke, Oct 14: "a claude chat box so we can ask
-- questions about the data … memory is stored here so it compounds").
-- chat_messages: one shared thread per page (`thread`, e.g. 'territory'):
--   who asked, what Claude answered, tokens used and what it cost.
-- chat_memory: short facts / decisions Claude (or an owner) saved; sent with
--   every question; deleting one hides it (kept for the record).
-- The monthly spending cap is settings 'chat_cap' (dollars).
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, email TEXT, name TEXT, at TEXT NOT NULL, usage TEXT, cost REAL, tools TEXT);
CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages (thread, id);
CREATE TABLE IF NOT EXISTS chat_memory (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, by_name TEXT, at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
