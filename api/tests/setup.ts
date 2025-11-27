import { env, applyD1Migrations } from 'cloudflare:test';
await applyD1Migrations(env.DB, [
  {
    name: '001_init.sql',
    queries: [
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        short_code TEXT UNIQUE NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        status TEXT NOT NULL DEFAULT 'active',
        expires_at INTEGER,
        host_pin TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS parties (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT,
        size INTEGER,
        joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        status TEXT NOT NULL DEFAULT 'waiting',
        nearby INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        party_id TEXT,
        type TEXT NOT NULL,
        ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        details TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (party_id) REFERENCES parties(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_parties_session ON parties(session_id);`,
      `CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts);`,
    ],
  },
  {
    name: '002_add_event_name.sql',
    queries: [`ALTER TABLE sessions ADD COLUMN event_name TEXT;`],
  },
  {
    name: '003_add_max_guests.sql',
    queries: [`ALTER TABLE sessions ADD COLUMN max_guests INTEGER DEFAULT 100;`],
  },
  {
    name: '005_add_location_contact.sql',
    queries: [
      `ALTER TABLE sessions ADD COLUMN location TEXT;`,
      `ALTER TABLE sessions ADD COLUMN contact_info TEXT;`,
    ],
  },
  {
    name: '006_add_open_hours.sql',
    queries: [
      `ALTER TABLE sessions ADD COLUMN open_time TEXT;`,
      `ALTER TABLE sessions ADD COLUMN close_time TEXT;`,
    ],
  },
  {
    name: '007_add_wait_tracking.sql',
    queries: [
      `ALTER TABLE parties ADD COLUMN called_at INTEGER;`,
      `ALTER TABLE parties ADD COLUMN completed_at INTEGER;`,
      `ALTER TABLE parties ADD COLUMN position_at_leave INTEGER;`,
      `ALTER TABLE parties ADD COLUMN wait_ms_at_leave INTEGER;`,
      `CREATE INDEX IF NOT EXISTS idx_parties_status_completed ON parties(status, completed_at);`,
    ],
  },
  {
    name: '008_add_eta_tracking.sql',
    queries: [`ALTER TABLE parties ADD COLUMN estimated_wait_ms INTEGER;`],
  },
  {
    name: '009_add_auth.sql',
    queries: [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        github_id INTEGER UNIQUE NOT NULL,
        github_username TEXT NOT NULL,
        github_avatar_url TEXT,
        email TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );`,
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );`,
      `CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        platform TEXT NOT NULL DEFAULT 'web',
        redirect_uri TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );`,
      `CREATE TABLE IF NOT EXISTS exchange_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );`,
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_exchange_tokens_expires ON exchange_tokens(expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);`,
      `ALTER TABLE sessions ADD COLUMN owner_id TEXT REFERENCES users(id);`,
    ],
  },
]);
