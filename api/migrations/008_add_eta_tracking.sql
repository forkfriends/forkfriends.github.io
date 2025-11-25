-- Add column to store estimated wait time shown at join
ALTER TABLE parties ADD COLUMN estimated_wait_ms INTEGER;
