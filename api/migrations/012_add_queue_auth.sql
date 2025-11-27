-- Add authentication requirements for queues and link parties to users

-- Flag to require guests to be authenticated to join a queue
ALTER TABLE sessions ADD COLUMN requires_auth INTEGER DEFAULT 0;

-- Link parties to authenticated users (nullable for anonymous guests)
ALTER TABLE parties ADD COLUMN user_id TEXT REFERENCES users(id);

-- Add return_to column to oauth_states for post-auth navigation
ALTER TABLE oauth_states ADD COLUMN return_to TEXT;

-- Index for finding queues by owner
CREATE INDEX IF NOT EXISTS idx_sessions_owner_id ON sessions(owner_id);

-- Index for finding queues by owner and status (for "my active queues")
CREATE INDEX IF NOT EXISTS idx_sessions_owner_status ON sessions(owner_id, status);

-- Index for finding a user's parties across queues
CREATE INDEX IF NOT EXISTS idx_parties_user_id ON parties(user_id);

-- Index for checking duplicate joins (user + session)
CREATE INDEX IF NOT EXISTS idx_parties_session_user ON parties(session_id, user_id);
