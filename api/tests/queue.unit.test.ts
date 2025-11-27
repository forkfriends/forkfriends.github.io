import { describe, expect, it } from 'vitest';
import { generateHostCookieValue, verifyHostCookie } from '../utils/auth';
import {
  generateSecureToken,
  hashToken,
  createSession,
  validateSession,
  deleteSession,
  createExchangeToken,
  validateExchangeToken,
} from '../utils/oauth';
import { env } from 'cloudflare:test';

describe('host auth helpers', () => {
  const secret = 'unit-test-secret';
  const sessionId = '1234567890abcdef';

  it('generates cookies that validate', async () => {
    const cookie = await generateHostCookieValue(sessionId, secret);
    expect(cookie.startsWith(`${sessionId}.`)).toBe(true);

    const ok = await verifyHostCookie(cookie, sessionId, secret);
    expect(ok).toBe(true);
  });

  it('fails when cookie signature changes', async () => {
    await generateHostCookieValue(sessionId, secret);
    const tampered = `${sessionId}.invalidsignature`;
    const ok = await verifyHostCookie(tampered, sessionId, secret);
    expect(ok).toBe(false);
  });

  it('fails when session id mismatches', async () => {
    const cookie = await generateHostCookieValue(sessionId, secret);
    const ok = await verifyHostCookie(cookie, 'other-session', secret);
    expect(ok).toBe(false);
  });
});

describe('token hashing', () => {
  it('generates different hashes for different tokens', async () => {
    const token1 = generateSecureToken(32);
    const token2 = generateSecureToken(32);

    const hash1 = await hashToken(token1);
    const hash2 = await hashToken(token2);

    expect(hash1).not.toBe(hash2);
    // Hashes should be 64 hex chars (256 bits)
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces consistent hashes for the same token', async () => {
    const token = generateSecureToken(32);
    const hash1 = await hashToken(token);
    const hash2 = await hashToken(token);

    expect(hash1).toBe(hash2);
  });

  it('generateSecureToken produces hex strings of correct length', () => {
    const token16 = generateSecureToken(16);
    const token32 = generateSecureToken(32);

    expect(token16).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
    expect(token32).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
  });
});

describe('session token round-trip', () => {
  it('creates and validates session with hashed token storage', async () => {
    // Create a test user first
    const userId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO users (id, email, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)'
    )
      .bind(userId, `test-${userId}@example.com`, now, now)
      .run();

    // Create session - returns raw token to client
    const session = await createSession(env.DB, userId);
    expect(session.id).toBeTruthy();
    expect(session.user_id).toBe(userId);

    // The raw token should NOT be stored in DB (we store hash instead)
    const rawTokenInDb = await env.DB.prepare('SELECT id FROM user_sessions WHERE id = ?1')
      .bind(session.id)
      .first();
    expect(rawTokenInDb).toBeNull();

    // But the hash of the token should be in DB
    const tokenHash = await hashToken(session.id);
    const hashInDb = await env.DB.prepare('SELECT id FROM user_sessions WHERE id = ?1')
      .bind(tokenHash)
      .first();
    expect(hashInDb).toBeTruthy();

    // Validate session using raw token (simulating client request)
    const user = await validateSession(env.DB, session.id);
    expect(user).toBeTruthy();
    expect(user?.id).toBe(userId);

    // Using the hash directly should NOT work (client never has hash)
    const userFromHash = await validateSession(env.DB, tokenHash);
    expect(userFromHash).toBeNull();

    // Delete session using raw token
    await deleteSession(env.DB, session.id);

    // Session should no longer be valid
    const deletedUser = await validateSession(env.DB, session.id);
    expect(deletedUser).toBeNull();
  });

  it('rejects invalid session tokens', async () => {
    const fakeToken = generateSecureToken(32);
    const user = await validateSession(env.DB, fakeToken);
    expect(user).toBeNull();
  });
});

describe('exchange token round-trip', () => {
  it('creates and validates exchange token with hashed storage', async () => {
    // Create a test user first
    const userId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO users (id, email, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)'
    )
      .bind(userId, `exchange-test-${userId}@example.com`, now, now)
      .run();

    // Create exchange token - returns raw token to client
    const rawToken = await createExchangeToken(env.DB, userId);
    expect(rawToken).toBeTruthy();
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

    // The raw token should NOT be stored in DB
    const rawInDb = await env.DB.prepare('SELECT token FROM exchange_tokens WHERE token = ?1')
      .bind(rawToken)
      .first();
    expect(rawInDb).toBeNull();

    // But the hash should be in DB
    const tokenHash = await hashToken(rawToken);
    const hashInDb = await env.DB.prepare('SELECT token FROM exchange_tokens WHERE token = ?1')
      .bind(tokenHash)
      .first();
    expect(hashInDb).toBeTruthy();

    // Validate and consume using raw token
    const returnedUserId = await validateExchangeToken(env.DB, rawToken);
    expect(returnedUserId).toBe(userId);

    // Token should be marked as used - second validation fails
    const secondAttempt = await validateExchangeToken(env.DB, rawToken);
    expect(secondAttempt).toBeNull();
  });

  it('rejects invalid exchange tokens', async () => {
    const fakeToken = generateSecureToken(32);
    const userId = await validateExchangeToken(env.DB, fakeToken);
    expect(userId).toBeNull();
  });

  it('prevents race condition with concurrent exchange attempts', async () => {
    // Create a test user
    const userId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO users (id, email, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)'
    )
      .bind(userId, `race-test-${userId}@example.com`, now, now)
      .run();

    // Create exchange token
    const rawToken = await createExchangeToken(env.DB, userId);

    // Simulate concurrent exchange attempts
    const results = await Promise.all([
      validateExchangeToken(env.DB, rawToken),
      validateExchangeToken(env.DB, rawToken),
      validateExchangeToken(env.DB, rawToken),
    ]);

    // Exactly one should succeed
    const successes = results.filter((r) => r === userId);
    const failures = results.filter((r) => r === null);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(2);
  });
});
