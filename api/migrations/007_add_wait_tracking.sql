-- Add columns for wait time tracking
ALTER TABLE parties ADD COLUMN called_at INTEGER;
ALTER TABLE parties ADD COLUMN completed_at INTEGER;
ALTER TABLE parties ADD COLUMN position_at_leave INTEGER;
ALTER TABLE parties ADD COLUMN wait_ms_at_leave INTEGER;

-- Index for wait time analytics queries
CREATE INDEX IF NOT EXISTS idx_parties_status_completed ON parties(status, completed_at);
