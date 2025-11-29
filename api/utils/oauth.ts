/**
 * OAuth utilities for QueueUp
 *
 * Handles:
 * - OAuth state generation and validation
 * - Token exchange with GitHub and Google
 * - Session management (cookies for web, bearer tokens for native)
 * - User creation/lookup
 */

// GitHub Constants
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

// Google Constants
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (reduced from 30)
const EXCHANGE_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const AUTH_COOKIE_NAME = 'queueup_session';
export const STATE_COOKIE_NAME = 'queueup_oauth_state';

// Allowed redirect URIs for security
const ALLOWED_REDIRECT_URIS = [
  // Production
  'https://forkfriends.github.io/',
  'https://forkfriends.github.io',
  // Localhost development (various ports used by different dev servers)
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:19000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
  'http://127.0.0.1:19000',
  // Native app deep link
  'queueup://auth/callback',
];

// Pattern for Expo Go development URLs (exp://IP:PORT/--/path)
const EXPO_GO_PATTERN = /^exp:\/\/[\d.]+:\d+\/--\/auth\/callback$/;

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string | null;
}

export interface GoogleUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export interface User {
  id: string;
  github_id: number | null;
  github_username: string | null;
  github_avatar_url: string | null;
  google_id: string | null;
  google_email: string | null;
  google_name: string | null;
  google_avatar_url: string | null;
  email: string | null;
  created_at: number;
  updated_at: number;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash a token using SHA-256 for secure storage
 * Returns a hex-encoded hash
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Create OAuth state and store it
 */
export async function createOAuthState(
  db: D1Database,
  platform: 'web' | 'native',
  redirectUri?: string | null,
  provider: 'github' | 'google' = 'github',
  returnTo?: string | null
): Promise<string> {
  const state = generateSecureToken(32);
  const expiresAt = Math.floor((Date.now() + STATE_EXPIRY_MS) / 1000);

  await db
    .prepare(
      'INSERT INTO oauth_states (state, platform, redirect_uri, expires_at, provider, return_to) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
    )
    .bind(state, platform, redirectUri || null, expiresAt, provider, returnTo || null)
    .run();

  return state;
}

/**
 * Validate and consume OAuth state
 */
export async function validateOAuthState(
  db: D1Database,
  state: string
): Promise<{
  platform: 'web' | 'native';
  redirectUri: string | null;
  provider: 'github' | 'google';
  returnTo: string | null;
} | null> {
  const now = Math.floor(Date.now() / 1000);

  // Atomic delete-and-return to prevent race conditions (TOCTOU)
  // This ensures the state can only be used once, even with concurrent requests
  const row = await db
    .prepare(
      'DELETE FROM oauth_states WHERE state = ?1 AND expires_at > ?2 RETURNING platform, redirect_uri, provider, return_to'
    )
    .bind(state, now)
    .first<{
      platform: 'web' | 'native';
      redirect_uri: string | null;
      provider: 'github' | 'google' | null;
      return_to: string | null;
    }>();

  if (!row) {
    return null;
  }

  return {
    platform: row.platform,
    redirectUri: row.redirect_uri,
    provider: row.provider || 'github',
    returnTo: row.return_to,
  };
}

/**
 * Build GitHub authorization URL
 */
export function buildGitHubAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = ['read:user', 'user:email']
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(' '),
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<string | null> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    console.error('GitHub token exchange failed:', response.status);
    return null;
  }

  const data = (await response.json()) as { access_token?: string; error?: string };

  if (data.error) {
    console.error('GitHub token error:', data.error);
    return null;
  }

  return data.access_token || null;
}

/**
 * Fetch GitHub user info
 */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser | null> {
  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'QueueUp-App',
    },
  });

  if (!response.ok) {
    console.error('GitHub user fetch failed:', response.status);
    return null;
  }

  const user = (await response.json()) as GitHubUser;

  // If email is null/private, fetch from /user/emails endpoint
  if (!user.email) {
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'QueueUp-App',
      },
    });

    if (emailResponse.ok) {
      const emails = (await emailResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      // Find primary verified email, or fall back to any verified email
      const primaryEmail = emails.find((e) => e.primary && e.verified);
      const verifiedEmail = emails.find((e) => e.verified);
      user.email = primaryEmail?.email || verifiedEmail?.email || null;
    }
  }

  return user;
}

/**
 * Build Google authorization URL
 */
export function buildGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = ['openid', 'email', 'profile']
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'select_account',
  });

  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange Google authorization code for access token
 */
export async function exchangeGoogleCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<string | null> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error('Google token exchange failed:', response.status);
    const text = await response.text();
    console.error('Google token error response:', text);
    return null;
  }

  const data = (await response.json()) as { access_token?: string; error?: string };

  if (data.error) {
    console.error('Google token error:', data.error);
    return null;
  }

  return data.access_token || null;
}

/**
 * Fetch Google user info
 */
export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser | null> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error('Google user fetch failed:', response.status);
    return null;
  }

  const user = (await response.json()) as GoogleUser;
  return user;
}

/**
 * Find or create user from GitHub profile
 * Links accounts if a user with the same email already exists (e.g., from Google sign-in)
 */
export async function findOrCreateUserFromGitHub(
  db: D1Database,
  githubUser: GitHubUser
): Promise<User> {
  // Check if user exists by GitHub ID
  const existing = await db
    .prepare('SELECT * FROM users WHERE github_id = ?1')
    .bind(githubUser.id)
    .first<User>();

  if (existing) {
    // Update user info (username/avatar might change)
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        'UPDATE users SET github_username = ?1, github_avatar_url = ?2, email = COALESCE(?3, email), updated_at = ?4 WHERE id = ?5'
      )
      .bind(githubUser.login, githubUser.avatar_url, githubUser.email, now, existing.id)
      .run();

    return {
      ...existing,
      github_username: githubUser.login,
      github_avatar_url: githubUser.avatar_url,
      email: githubUser.email || existing.email,
      updated_at: now,
    };
  }

  // Check if user exists by email (link accounts)
  // This allows users who signed up with Google to link their GitHub account
  if (githubUser.email) {
    const existingByEmail = await db
      .prepare('SELECT * FROM users WHERE email = ?1')
      .bind(githubUser.email)
      .first<User>();

    if (existingByEmail) {
      // Link GitHub account to existing user
      const now = Math.floor(Date.now() / 1000);
      await db
        .prepare(
          'UPDATE users SET github_id = ?1, github_username = ?2, github_avatar_url = ?3, updated_at = ?4 WHERE id = ?5'
        )
        .bind(githubUser.id, githubUser.login, githubUser.avatar_url, now, existingByEmail.id)
        .run();

      return {
        ...existingByEmail,
        github_id: githubUser.id,
        github_username: githubUser.login,
        github_avatar_url: githubUser.avatar_url,
        updated_at: now,
      };
    }
  }

  // Create new user
  const id = generateUUID();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      'INSERT INTO users (id, github_id, github_username, github_avatar_url, email, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    )
    .bind(id, githubUser.id, githubUser.login, githubUser.avatar_url, githubUser.email, now, now)
    .run();

  return {
    id,
    github_id: githubUser.id,
    github_username: githubUser.login,
    github_avatar_url: githubUser.avatar_url,
    google_id: null,
    google_email: null,
    google_name: null,
    google_avatar_url: null,
    email: githubUser.email,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Find or create user from Google profile
 * Links accounts if a user with the same email already exists (e.g., from GitHub sign-in)
 */
export async function findOrCreateUserFromGoogle(
  db: D1Database,
  googleUser: GoogleUser
): Promise<User> {
  // Check if user exists by Google ID
  const existing = await db
    .prepare('SELECT * FROM users WHERE google_id = ?1')
    .bind(googleUser.id)
    .first<User>();

  if (existing) {
    // Update user info
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        'UPDATE users SET google_email = ?1, google_name = ?2, google_avatar_url = ?3, email = COALESCE(?4, email), updated_at = ?5 WHERE id = ?6'
      )
      .bind(
        googleUser.email,
        googleUser.name,
        googleUser.picture || null,
        googleUser.email,
        now,
        existing.id
      )
      .run();

    return {
      ...existing,
      google_email: googleUser.email,
      google_name: googleUser.name,
      google_avatar_url: googleUser.picture || null,
      email: googleUser.email || existing.email,
      updated_at: now,
    };
  }

  // Check if user exists by email (link accounts)
  const existingByEmail = await db
    .prepare('SELECT * FROM users WHERE email = ?1')
    .bind(googleUser.email)
    .first<User>();

  if (existingByEmail) {
    // Link Google account to existing user
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        'UPDATE users SET google_id = ?1, google_email = ?2, google_name = ?3, google_avatar_url = ?4, updated_at = ?5 WHERE id = ?6'
      )
      .bind(
        googleUser.id,
        googleUser.email,
        googleUser.name,
        googleUser.picture || null,
        now,
        existingByEmail.id
      )
      .run();

    return {
      ...existingByEmail,
      google_id: googleUser.id,
      google_email: googleUser.email,
      google_name: googleUser.name,
      google_avatar_url: googleUser.picture || null,
      updated_at: now,
    };
  }

  // Create new user
  const id = generateUUID();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      'INSERT INTO users (id, google_id, google_email, google_name, google_avatar_url, email, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
    )
    .bind(
      id,
      googleUser.id,
      googleUser.email,
      googleUser.name,
      googleUser.picture || null,
      googleUser.email,
      now,
      now
    )
    .run();

  return {
    id,
    github_id: null,
    github_username: null,
    github_avatar_url: null,
    google_id: googleUser.id,
    google_email: googleUser.email,
    google_name: googleUser.name,
    google_avatar_url: googleUser.picture || null,
    email: googleUser.email,
    created_at: now,
    updated_at: now,
  };
}

// Keep old function name for backwards compatibility
export const findOrCreateUser = findOrCreateUserFromGitHub;

/**
 * Create a new session for a user
 * The session ID returned to the client is the raw token.
 * We store a SHA-256 hash of the token in the database.
 */
export async function createSession(db: D1Database, userId: string): Promise<Session> {
  const rawToken = generateSecureToken(32);
  const tokenHash = await hashToken(rawToken);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.floor((Date.now() + SESSION_EXPIRY_MS) / 1000);

  await db
    .prepare(
      'INSERT INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)'
    )
    .bind(tokenHash, userId, expiresAt, now)
    .run();

  // Return the raw token to the client (they never see the hash)
  return { id: rawToken, user_id: userId, expires_at: expiresAt, created_at: now };
}

/**
 * Validate session and get user
 * The client provides the raw token; we hash it to look up in DB
 */
export async function validateSession(db: D1Database, sessionId: string): Promise<User | null> {
  const tokenHash = await hashToken(sessionId);
  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .prepare(
      `SELECT u.* FROM users u
       INNER JOIN user_sessions s ON u.id = s.user_id
       WHERE s.id = ?1 AND s.expires_at > ?2`
    )
    .bind(tokenHash, now)
    .first<User>();

  return result || null;
}

/**
 * Delete a session (logout)
 * The client provides the raw token; we hash it to find in DB
 */
export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  const tokenHash = await hashToken(sessionId);
  await db.prepare('DELETE FROM user_sessions WHERE id = ?1').bind(tokenHash).run();
}

/**
 * Delete all sessions for a user (logout everywhere)
 */
export async function deleteAllUserSessions(db: D1Database, userId: string): Promise<number> {
  const result = await db
    .prepare('DELETE FROM user_sessions WHERE user_id = ?1')
    .bind(userId)
    .run();
  return result.meta.changes;
}

/**
 * Create a short-lived exchange token for native apps
 * We store the hash, return the raw token to the client
 */
export async function createExchangeToken(db: D1Database, userId: string): Promise<string> {
  const rawToken = generateSecureToken(32);
  const tokenHash = await hashToken(rawToken);
  const expiresAt = Math.floor((Date.now() + EXCHANGE_TOKEN_EXPIRY_MS) / 1000);

  await db
    .prepare('INSERT INTO exchange_tokens (token, user_id, expires_at) VALUES (?1, ?2, ?3)')
    .bind(tokenHash, userId, expiresAt)
    .run();

  return rawToken;
}

/**
 * Validate and consume exchange token
 * The client provides the raw token; we hash it to look up in DB
 */
export async function validateExchangeToken(db: D1Database, token: string): Promise<string | null> {
  const tokenHash = await hashToken(token);
  const now = Math.floor(Date.now() / 1000);

  // Atomic update-and-return to prevent race conditions (TOCTOU)
  // This ensures the token can only be used once, even with concurrent requests
  const row = await db
    .prepare(
      'UPDATE exchange_tokens SET used = 1 WHERE token = ?1 AND expires_at > ?2 AND used = 0 RETURNING user_id'
    )
    .bind(tokenHash, now)
    .first<{ user_id: string }>();

  if (!row) {
    return null;
  }

  return row.user_id;
}

/**
 * Build session cookie string
 */
export function buildSessionCookie(
  sessionId: string,
  maxAgeSeconds: number,
  domain?: string
): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=${sessionId}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'Secure',
    'SameSite=None', // Required for cross-origin requests with credentials
    'Path=/',
  ];

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  return parts.join('; ');
}

/**
 * Build cookie to clear session
 */
export function buildClearSessionCookie(domain?: string): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=None', // Must match the original cookie's SameSite setting
    'Path=/',
  ];

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  return parts.join('; ');
}

/**
 * Parse session ID from cookie header
 */
export function parseSessionFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === AUTH_COOKIE_NAME && value) {
      return value;
    }
  }

  return null;
}

/**
 * Parse session ID from Authorization header (Bearer token)
 */
export function parseSessionFromBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? match[1] : null;
}

/**
 * Get session ID from request (cookie or bearer token)
 */
export function getSessionFromRequest(request: Request): string | null {
  // Try Bearer token first (for native apps)
  const bearerSession = parseSessionFromBearer(request.headers.get('Authorization'));
  if (bearerSession) return bearerSession;

  // Fall back to cookie (for web)
  return parseSessionFromCookie(request.headers.get('Cookie'));
}

/**
 * Validate redirect URI
 * Ensures the URI exactly matches an allowed origin or is a subpath of an allowed origin.
 * Prevents open redirect attacks (e.g., forkfriends.github.io.evil.com)
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    // Check for Expo Go development URLs (exp://IP:PORT/--/auth/callback)
    // These are only valid during development
    if (EXPO_GO_PATTERN.test(uri)) {
      return true;
    }

    const parsedUri = new URL(uri);
    return ALLOWED_REDIRECT_URIS.some((allowed) => {
      const parsedAllowed = new URL(allowed);
      // Must match protocol and host exactly
      if (parsedUri.protocol !== parsedAllowed.protocol) return false;
      if (parsedUri.host !== parsedAllowed.host) return false;
      // Path must be equal or a subpath (starts with allowed path)
      return (
        parsedUri.pathname === parsedAllowed.pathname ||
        parsedUri.pathname.startsWith(
          parsedAllowed.pathname.endsWith('/')
            ? parsedAllowed.pathname
            : parsedAllowed.pathname + '/'
        )
      );
    });
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Validate return_to parameter
 * Must be a relative path starting with / (no protocol, no host)
 * Prevents open redirect attacks via return_to parameter
 */
export function isValidReturnTo(returnTo: string): boolean {
  // Must start with / and not contain // (prevents protocol-relative URLs)
  // Must not contain : before the first / (prevents javascript:, data:, etc.)
  if (!returnTo.startsWith('/')) return false;
  if (returnTo.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(returnTo)) return false;
  // Additional check: no backslashes (some browsers normalize \\ to //)
  if (returnTo.includes('\\')) return false;
  return true;
}

/**
 * Sanitize return_to parameter
 * Returns the value if valid, null otherwise
 */
export function sanitizeReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;
  return isValidReturnTo(returnTo) ? returnTo : null;
}

/**
 * Clean up expired tokens and states
 */
export async function cleanupExpiredAuth(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await Promise.all([
    db.prepare('DELETE FROM oauth_states WHERE expires_at < ?1').bind(now).run(),
    db.prepare('DELETE FROM exchange_tokens WHERE expires_at < ?1').bind(now).run(),
    db.prepare('DELETE FROM user_sessions WHERE expires_at < ?1').bind(now).run(),
  ]);
}

/**
 * Parse admin emails from environment variable string
 */
function parseAdminEmails(adminEmailsEnv: string | undefined): string[] {
  if (!adminEmailsEnv) return [];
  return adminEmailsEnv.split(',').map((e) => e.trim().toLowerCase());
}

/**
 * Check if a user is an admin
 * @param user - The user to check
 * @param adminEmailsEnv - The ADMIN_EMAILS environment variable (comma-separated list)
 */
export function isAdmin(user: User | null, adminEmailsEnv: string | undefined): boolean {
  if (!user) return false;
  const adminEmails = parseAdminEmails(adminEmailsEnv);
  // Check email for admin status
  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Validate session and check if user is admin
 * Returns the user if they are an admin, null otherwise
 */
export async function validateAdminSession(
  db: D1Database,
  sessionId: string,
  adminEmailsEnv: string | undefined
): Promise<User | null> {
  const user = await validateSession(db, sessionId);
  if (!user) return null;
  if (!isAdmin(user, adminEmailsEnv)) return null;
  return user;
}

/**
 * Get authenticated admin user from request
 * Returns { user, error } - if error is set, return that response
 */
export async function requireAdmin(
  db: D1Database,
  request: Request,
  adminEmailsEnv: string | undefined
): Promise<{ user: User | null; error: Response | null }> {
  const sessionId = getSessionFromRequest(request);

  if (!sessionId) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    };
  }

  const user = await validateSession(db, sessionId);

  if (!user) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    };
  }

  if (!isAdmin(user, adminEmailsEnv)) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    };
  }

  return { user, error: null };
}
