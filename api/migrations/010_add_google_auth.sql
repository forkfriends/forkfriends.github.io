-- Add Google OAuth support to users table
-- Users can now sign in with either GitHub or Google

-- Add Google-specific columns
ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN google_email TEXT;
ALTER TABLE users ADD COLUMN google_name TEXT;
ALTER TABLE users ADD COLUMN google_avatar_url TEXT;

-- Make github_id nullable (users can sign in with Google only)
-- SQLite doesn't support ALTER COLUMN, so we keep github_id as-is
-- but allow NULL values going forward by not enforcing NOT NULL on new inserts

-- Add index for Google ID lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Add oauth_states provider column to track which provider initiated the flow
ALTER TABLE oauth_states ADD COLUMN provider TEXT DEFAULT 'github';
