# Authentication System

QueueUp uses OAuth 2.0 for authentication, supporting both GitHub and Google as identity providers. The system is designed to work across web and native platforms with account linking based on email.

## Overview

- **Providers**: GitHub, Google
- **Session Management**: 14-day sessions with secure hashed tokens
- **Account Linking**: Accounts with the same email are automatically linked
- **Admin Access**: Controlled via `ADMIN_EMAILS` environment variable

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Frontend  │────▶│  Worker API │────▶│  GitHub/Google  │
│  (Web/App)  │◀────│  (OAuth)    │◀────│     OAuth       │
└─────────────┘     └─────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  D1 Database │
                    │  (Users,     │
                    │   Sessions)  │
                    └─────────────┘
```

## Database Schema

### users

| Column            | Type    | Description                              |
| ----------------- | ------- | ---------------------------------------- |
| id                | TEXT    | Primary key (UUID)                       |
| github_id         | INTEGER | GitHub user ID (nullable)                |
| github_username   | TEXT    | GitHub username (nullable)               |
| github_avatar_url | TEXT    | GitHub avatar URL                        |
| google_id         | TEXT    | Google user ID (nullable)                |
| google_email      | TEXT    | Google email                             |
| google_name       | TEXT    | Google display name                      |
| google_avatar_url | TEXT    | Google avatar URL                        |
| email             | TEXT    | Primary email (used for account linking) |
| created_at        | INTEGER | Unix timestamp                           |
| updated_at        | INTEGER | Unix timestamp                           |

### user_sessions

| Column     | Type    | Description                 |
| ---------- | ------- | --------------------------- |
| id         | TEXT    | Session token (primary key) |
| user_id    | TEXT    | Foreign key to users        |
| expires_at | INTEGER | Expiration timestamp        |
| created_at | INTEGER | Unix timestamp              |

### oauth_states

| Column       | Type    | Description                   |
| ------------ | ------- | ----------------------------- |
| state        | TEXT    | CSRF token (primary key)      |
| platform     | TEXT    | 'web' or 'native'             |
| redirect_uri | TEXT    | Where to redirect after auth  |
| provider     | TEXT    | 'github' or 'google'          |
| expires_at   | INTEGER | Expiration timestamp (10 min) |

### exchange_tokens

| Column     | Type    | Description                  |
| ---------- | ------- | ---------------------------- |
| token      | TEXT    | One-time exchange token      |
| user_id    | TEXT    | Foreign key to users         |
| expires_at | INTEGER | Expiration timestamp (5 min) |
| used       | INTEGER | Whether token has been used  |

## OAuth Flow

### Web Flow

1. User clicks "Sign in with GitHub/Google"
2. Frontend redirects to `/api/auth/{provider}?platform=web&redirect_uri={origin}`
3. API creates OAuth state, stores `redirect_uri`, redirects to provider
4. User authenticates with provider
5. Provider redirects to `/api/auth/{provider}/callback?code=...&state=...`
6. API exchanges code for token, fetches user info
7. API finds or creates user (linking by email if exists)
8. API creates session and exchange token
9. API redirects to `redirect_uri#auth=success&exchange_token=...` (using URL fragment for security)
10. Frontend reads exchange token from URL fragment
11. Frontend exchanges token for session via `/api/auth/exchange`
12. Frontend stores session token in localStorage

### Native Flow

Same as web, but:

- `platform=native` and `redirect_uri=queueup://auth/callback`
- Opens system browser for OAuth
- Deep link returns to app with exchange token

## API Endpoints

### GET /api/auth/github

Start GitHub OAuth flow.

**Query Parameters:**

- `platform`: 'web' | 'native' (default: 'web')
- `redirect_uri`: Where to redirect after auth (validated against whitelist)

### GET /api/auth/github/callback

GitHub OAuth callback. Handles code exchange and user creation.

### GET /api/auth/google

Start Google OAuth flow.

**Query Parameters:**

- `platform`: 'web' | 'native' (default: 'web')
- `redirect_uri`: Where to redirect after auth

### GET /api/auth/google/callback

Google OAuth callback. Handles code exchange and user creation.

### POST /api/auth/exchange

Exchange a one-time token for a session.

**Request Body:**

```json
{
  "exchange_token": "abc123..."
}
```

**Response:**

```json
{
  "session_token": "xyz789...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "github_username": "octocat",
    "google_name": "John Doe",
    "is_admin": false
  }
}
```

### GET /api/auth/me

Get current authenticated user.

**Headers:**

- `Authorization: Bearer {session_token}` (for native/cross-origin)
- Or session cookie (for same-origin web)

**Response:**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "github_username": "octocat",
    "github_avatar_url": "https://...",
    "google_name": "John Doe",
    "google_email": "user@gmail.com",
    "google_avatar_url": "https://...",
    "is_admin": false
  }
}
```

### POST /api/auth/logout

End current session.

**Headers:**

- `Authorization: Bearer {session_token}` or session cookie

## Account Linking

Accounts are automatically linked when a user signs in with a different provider but the same email:

1. User signs in with GitHub (email: user@example.com)
   - Creates user record with `github_id`, `email`
2. User signs in with Google (same email: user@example.com)
   - Finds existing user by email
   - Updates user with `google_id`, `google_name`, etc.
   - Same user account, both providers linked

This works bidirectionally - Google first, then GitHub also links.

## Admin Access

Admin status is determined by the `ADMIN_EMAILS` environment variable (comma-separated list):

```bash
# Set in wrangler.toml or as a secret
ADMIN_EMAILS=admin@example.com,another@example.com
```

The check in `api/utils/oauth.ts`:

```typescript
export function isAdmin(user: User | null, adminEmailsEnv?: string): boolean {
  if (!user) return false;
  const adminEmails = (adminEmailsEnv || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return true;
  }
  return false;
}
```

Admin users have access to:

- Analytics dashboard (`/api/analytics/*`)
- Data export endpoints

## Security Considerations

### CSRF Protection

- OAuth state parameter prevents CSRF attacks
- State is single-use and expires after 10 minutes

### Token Security

- Session tokens are cryptographically random (32 bytes), stored as SHA-256 hashes in DB
- Exchange tokens are single-use, expire after 5 minutes, stored as SHA-256 hashes
- Sessions expire after 14 days
- Tokens are sent via URL fragment (not query string) to prevent Referer header leakage

### Redirect URI Validation

All redirect URIs are validated against a whitelist:

```typescript
const ALLOWED_REDIRECT_URIS = [
  'https://forkfriends.github.io/',
  'https://forkfriends.github.io',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:19000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
  'http://127.0.0.1:19000',
  'queueup://auth/callback',
];
```

### Cross-Origin Authentication

For cross-origin scenarios (e.g., frontend on localhost:8081, API on localhost:8787):

- Cookies don't work cross-origin
- Exchange tokens are used instead
- Frontend stores session token in localStorage
- Session token sent via `Authorization: Bearer` header

## Environment Variables

### Required for GitHub OAuth

- `GITHUB_CLIENT_ID`: GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth App client secret

### Required for Google OAuth

- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret

### Admin Configuration

- `ADMIN_EMAILS`: Comma-separated list of admin email addresses

### Cloudflare Setup

```bash
# Set secrets in Cloudflare Workers
cd api
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

## Provider Configuration

### GitHub OAuth App

1. Go to GitHub Settings > Developer Settings > OAuth Apps
2. Create new OAuth App
3. Set Authorization callback URL:
   - Production: `https://your-api.workers.dev/api/auth/github/callback`
   - Local: `http://localhost:8787/api/auth/github/callback`

### Google OAuth

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create OAuth 2.0 Client ID
3. Add Authorized redirect URIs:
   - Production: `https://your-api.workers.dev/api/auth/google/callback`
   - Local: `http://localhost:8787/api/auth/google/callback`
4. Add Authorized JavaScript origins:
   - Production: `https://forkfriends.github.io`
   - Local: `http://localhost:8081`

## Frontend Integration

### AuthContext

The `contexts/AuthContext.tsx` provides:

```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (provider?: 'github' | 'google') => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
```

### Usage

```tsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <Button onPress={() => login('github')}>Sign in with GitHub</Button>;
  }

  return (
    <View>
      <Text>Welcome, {user.email}</Text>
      <Button onPress={logout}>Log out</Button>
    </View>
  );
}
```

## Migrations

Auth-related migrations:

- `009_add_auth.sql`: Creates users, sessions, oauth_states, exchange_tokens tables
- `010_add_google_auth.sql`: Adds Google OAuth columns
- `011_fix_github_id_nullable.sql`: Makes github_id nullable for Google-only users
