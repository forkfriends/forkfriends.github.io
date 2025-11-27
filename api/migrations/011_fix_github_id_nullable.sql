-- Fix github_id to be nullable (for Google-only users)
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Step 1: Create new table with correct schema
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE,  -- Now nullable
  github_username TEXT,       -- Now nullable
  github_avatar_url TEXT,
  google_id TEXT UNIQUE,
  google_email TEXT,
  google_name TEXT,
  google_avatar_url TEXT,
  email TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Step 2: Copy existing data
INSERT INTO users_new (id, github_id, github_username, github_avatar_url, google_id, google_email, google_name, google_avatar_url, email, created_at, updated_at)
SELECT id, github_id, github_username, github_avatar_url, google_id, google_email, google_name, google_avatar_url, email, created_at, updated_at
FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
