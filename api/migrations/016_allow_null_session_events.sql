-- Allow null session_id in events table for tracking analytics before session is established
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Create new table with nullable session_id
CREATE TABLE IF NOT EXISTS events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  party_id TEXT,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  details TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id)
);

-- Copy existing data
INSERT INTO events_new (id, session_id, party_id, type, ts, details)
SELECT id, session_id, party_id, type, ts, details FROM events;

-- Drop old table
DROP TABLE events;

-- Rename new table
ALTER TABLE events_new RENAME TO events;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);
