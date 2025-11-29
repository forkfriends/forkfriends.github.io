import { buildPushPayload } from '@block65/webcrypto-web-push';
import {
  HOST_COOKIE_MAX_AGE_SECONDS,
  HOST_COOKIE_NAME,
  generateHostCookieValue,
  verifyHostCookie,
} from './utils/auth';
import {
  buildClearSessionCookie,
  buildGitHubAuthUrl,
  buildGoogleAuthUrl,
  buildSessionCookie,
  createExchangeToken,
  createOAuthState,
  createSession,
  deleteAllUserSessions,
  deleteSession,
  exchangeCodeForToken,
  exchangeGoogleCodeForToken,
  fetchGitHubUser,
  fetchGoogleUser,
  findOrCreateUserFromGitHub,
  findOrCreateUserFromGoogle,
  getSessionFromRequest,
  isAdmin,
  isValidRedirectUri,
  requireAdmin,
  sanitizeReturnTo,
  validateExchangeToken,
  validateOAuthState,
  validateSession,
} from './utils/oauth';
import { logAnalyticsEvent } from './analytics';
export { QueueDO } from './queue-do';

export interface Env {
  QUEUE_DO: DurableObjectNamespace;
  QUEUE_KV: KVNamespace;
  DB: D1Database;
  EVENTS: Queue;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY?: string;
  HOST_AUTH_SECRET: string;
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  VAPID_SUBJECT?: string;
  ALLOWED_ORIGINS?: string;
  TURNSTILE_BYPASS?: string;
  TEST_MODE?: string;
  APP_BASE_URL?: string;
  // GitHub OAuth
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  // Google OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Admin emails (comma-separated)
  ADMIN_EMAILS?: string;
}

const DEFAULT_APP_BASE_URL = 'https://forkfriends.github.io/';
const MS_PER_MINUTE = 60 * 1000;
const FALLBACK_CALL_WINDOW_MINUTES = 2;

/**
 * Safely build a redirect URL, validating the URI to prevent open redirect attacks.
 * Falls back to DEFAULT_APP_BASE_URL if the URI is invalid or not provided.
 */
function safeRedirectUrl(uri: string | null | undefined): URL {
  if (uri && isValidRedirectUri(uri)) {
    return new URL(uri);
  }
  return new URL(DEFAULT_APP_BASE_URL);
}

const ROUTE =
  /^\/api\/queue(?:\/(create|[A-Za-z0-9]{6})(?:\/(join|declare-nearby|leave|advance|kick|close|connect|snapshot))?)?$/;
const SHORT_CODE_LENGTH = 6;
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MIN_QUEUE_CAPACITY = 1;
const MAX_QUEUE_CAPACITY = 100;
const MAX_LOCATION_LENGTH = 240;
const MAX_CONTACT_LENGTH = 500;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const queueLinkMatch = /^\/queue\/([A-Za-z0-9]{6})$/.exec(url.pathname);
      if (queueLinkMatch) {
        const code = queueLinkMatch[1].toUpperCase();
        const baseUrl =
          env.APP_BASE_URL && env.APP_BASE_URL.trim().length > 0
            ? env.APP_BASE_URL.trim()
            : DEFAULT_APP_BASE_URL;
        let redirectUrl: URL;
        try {
          redirectUrl = new URL(baseUrl);
        } catch (error) {
          console.warn('Invalid APP_BASE_URL, falling back to default');
          redirectUrl = new URL(DEFAULT_APP_BASE_URL);
        }
        redirectUrl.searchParams.set('code', code);
        return Response.redirect(redirectUrl.toString(), 302);
      }

      // Turnstile Widget Page (for native apps) - served before CORS check
      if (url.pathname === '/turnstile') {
        // Use server-configured site key - don't accept from query params to prevent XSS
        const siteKey = env.TURNSTILE_SITE_KEY || '';
        if (!siteKey) {
          return new Response('Turnstile not configured', { status: 503 });
        }

        // Validate theme parameter - only allow known values
        const themeParam = url.searchParams.get('theme');
        const theme = themeParam === 'dark' || themeParam === 'auto' ? themeParam : 'light';

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
    body { display: flex; justify-content: center; align-items: center; }
    #turnstile-container { display: flex; justify-content: center; align-items: center; }
    .loading { color: #666; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; }
  </style>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad" async defer></script>
</head>
<body>
  <div id="turnstile-container">
    <div class="loading">Loading...</div>
  </div>
  <script>
    function postMessage(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }
    function onTurnstileLoad() {
      postMessage({ type: 'log', message: 'Turnstile script loaded' });
      var container = document.getElementById('turnstile-container');
      container.innerHTML = '';
      try {
        turnstile.render(container, {
          sitekey: '${siteKey}',
          theme: '${theme}',
          callback: function(token) { postMessage({ type: 'success', token: token }); },
          'error-callback': function(error) { postMessage({ type: 'error', error: error || 'Unknown error' }); },
          'expired-callback': function() { postMessage({ type: 'expire' }); }
        });
        postMessage({ type: 'ready' });
      } catch (e) {
        postMessage({ type: 'error', error: e.message || 'Failed to render widget' });
      }
    }
    setTimeout(function() {
      if (typeof turnstile === 'undefined') {
        postMessage({ type: 'error', error: 'Turnstile script failed to load' });
      }
    }, 10000);
  </script>
</body>
</html>`;

        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    const originResult = resolveAllowedOrigin(request, url, env);
    if (originResult instanceof Response) {
      return originResult;
    }
    const corsOrigin = originResult;

    if (request.method === 'OPTIONS') {
      return applyCors(new Response(null, { status: 204 }), corsOrigin, undefined, true);
    }

    // ============================================
    // GitHub OAuth Authentication Routes
    // ============================================

    // Start GitHub OAuth flow
    if (request.method === 'GET' && url.pathname === '/api/auth/github') {
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return applyCors(jsonError('GitHub OAuth not configured', 500), corsOrigin);
      }

      // Rate limit: 20 OAuth starts per minute per IP
      const clientIp = getClientIp(request);
      if (await isRateLimited(env, `oauth:${clientIp}`, 20, 60, true)) {
        return applyCors(jsonError('Too many requests', 429), corsOrigin);
      }

      const rawPlatform = url.searchParams.get('platform');
      const platform: 'web' | 'native' = rawPlatform === 'native' ? 'native' : 'web';
      const redirectUri = url.searchParams.get('redirect_uri') || null;
      const returnTo = sanitizeReturnTo(url.searchParams.get('return_to'));

      // Validate redirect_uri if provided (for native apps)
      if (redirectUri && !isValidRedirectUri(redirectUri)) {
        return applyCors(jsonError('Invalid redirect_uri', 400), corsOrigin);
      }

      try {
        // Create and store OAuth state (now includes return_to)
        const state = await createOAuthState(env.DB, platform, redirectUri, 'github', returnTo);

        // Build callback URL (always points to our worker)
        const callbackUrl = new URL('/api/auth/github/callback', url.origin).toString();

        // Build GitHub authorization URL
        const githubAuthUrl = buildGitHubAuthUrl(env.GITHUB_CLIENT_ID, callbackUrl, state);

        // Redirect to GitHub
        return Response.redirect(githubAuthUrl, 302);
      } catch (e) {
        console.error('OAuth start error:', e);
        return applyCors(jsonError('Failed to start OAuth flow', 500), corsOrigin);
      }
    }

    // GitHub OAuth callback
    if (request.method === 'GET' && url.pathname === '/api/auth/github/callback') {
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return applyCors(jsonError('GitHub OAuth not configured', 500), corsOrigin);
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      // Handle OAuth error
      if (error) {
        const errorDesc = url.searchParams.get('error_description') || 'Authorization denied';
        console.error('GitHub OAuth error:', error, errorDesc);
        const failureUrl = new URL(DEFAULT_APP_BASE_URL);
        failureUrl.searchParams.set('auth', 'error');
        failureUrl.searchParams.set('error', errorDesc);
        return Response.redirect(failureUrl.toString(), 302);
      }

      if (!code || !state) {
        return applyCors(jsonError('Missing code or state', 400), corsOrigin);
      }

      try {
        // Validate state
        const stateData = await validateOAuthState(env.DB, state);
        if (!stateData) {
          const failureUrl = new URL(DEFAULT_APP_BASE_URL);
          failureUrl.searchParams.set('auth', 'error');
          failureUrl.searchParams.set('error', 'Invalid or expired state');
          return Response.redirect(failureUrl.toString(), 302);
        }

        // Exchange code for token
        const callbackUrl = new URL('/api/auth/github/callback', url.origin).toString();
        const accessToken = await exchangeCodeForToken(
          env.GITHUB_CLIENT_ID,
          env.GITHUB_CLIENT_SECRET,
          code,
          callbackUrl
        );

        if (!accessToken) {
          const failureUrl = new URL(DEFAULT_APP_BASE_URL);
          failureUrl.searchParams.set('auth', 'error');
          failureUrl.searchParams.set('error', 'Failed to exchange code for token');
          return Response.redirect(failureUrl.toString(), 302);
        }

        // Fetch GitHub user info
        const githubUser = await fetchGitHubUser(accessToken);
        if (!githubUser) {
          const failureUrl = new URL(DEFAULT_APP_BASE_URL);
          failureUrl.searchParams.set('auth', 'error');
          failureUrl.searchParams.set('error', 'Failed to fetch user info');
          return Response.redirect(failureUrl.toString(), 302);
        }

        // Find or create user
        const user = await findOrCreateUserFromGitHub(env.DB, githubUser);

        // Create session
        const session = await createSession(env.DB, user.id);

        // Handle redirect based on platform and origin
        const appUrl = stateData.redirectUri || DEFAULT_APP_BASE_URL;
        const successUrl = new URL(appUrl);

        // Check if this is a cross-origin redirect (different host than API)
        // Cross-origin includes: native apps, localhost dev, or any non-same-origin
        const isCrossOrigin =
          stateData.platform === 'native' ||
          successUrl.hostname === 'localhost' ||
          successUrl.hostname === '127.0.0.1' ||
          successUrl.origin !== url.origin;

        if (isCrossOrigin) {
          // For cross-origin: use exchange token in URL fragment (cookies won't work cross-origin)
          // Using fragment prevents token leakage via Referer header
          const exchangeToken = await createExchangeToken(env.DB, user.id);
          const fragmentParams = new URLSearchParams();
          fragmentParams.set('exchange_token', exchangeToken);
          fragmentParams.set('auth', 'success');
          if (stateData.returnTo) {
            fragmentParams.set('return_to', stateData.returnTo);
          }

          // For custom schemes (exp://, queueup://), URL.origin returns 'null' (as string)
          // so we need to construct the base URL manually
          const baseUrl =
            successUrl.origin !== 'null' && successUrl.origin
              ? `${successUrl.origin}${successUrl.pathname}`
              : `${successUrl.protocol}//${successUrl.host}${successUrl.pathname}`;
          const redirectUrl = `${baseUrl}#${fragmentParams.toString()}`;

          // For native apps with custom schemes (exp://, queueup://), browsers can't redirect directly.
          // We need to return an HTML page that triggers the redirect via JavaScript.
          const isCustomScheme =
            successUrl.protocol === 'exp:' || successUrl.protocol === 'queueup:';

          if (isCustomScheme) {
            // Return an HTML page that redirects to the custom scheme
            const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 20px; }
    .spinner { width: 40px; height: 40px; border: 3px solid #ddd; border-top-color: #333; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    a { color: #007AFF; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Redirecting back to the app...</p>
    <p><a href="${redirectUrl}" id="link">Click here if not redirected</a></p>
  </div>
  <script>
    window.location.href = "${redirectUrl}";
  </script>
</body>
</html>`;
            return new Response(html, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            });
          }

          return Response.redirect(redirectUrl, 302);
        }

        // For same-origin web: set HttpOnly cookie and redirect
        successUrl.searchParams.set('auth', 'success');
        // Pass through return_to for post-auth navigation
        if (stateData.returnTo) {
          successUrl.searchParams.set('return_to', stateData.returnTo);
        }

        const sessionCookieMaxAge = 14 * 24 * 60 * 60; // 14 days
        const headers = new Headers({
          Location: successUrl.toString(),
        });
        headers.append('Set-Cookie', buildSessionCookie(session.id, sessionCookieMaxAge));

        return new Response(null, { status: 302, headers });
      } catch (e) {
        console.error('OAuth callback error:', e);
        const failureUrl = new URL(DEFAULT_APP_BASE_URL);
        failureUrl.searchParams.set('auth', 'error');
        failureUrl.searchParams.set('error', 'Authentication failed');
        return Response.redirect(failureUrl.toString(), 302);
      }
    }

    // ============================================
    // Google OAuth Authentication Routes
    // ============================================

    // Start Google OAuth flow
    if (request.method === 'GET' && url.pathname === '/api/auth/google') {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return applyCors(jsonError('Google OAuth not configured', 500), corsOrigin);
      }

      // Rate limit: 20 OAuth starts per minute per IP (shared with GitHub)
      const clientIp = getClientIp(request);
      if (await isRateLimited(env, `oauth:${clientIp}`, 20, 60, true)) {
        return applyCors(jsonError('Too many requests', 429), corsOrigin);
      }

      const rawPlatform = url.searchParams.get('platform');
      const platform: 'web' | 'native' = rawPlatform === 'native' ? 'native' : 'web';
      const redirectUri = url.searchParams.get('redirect_uri') || null;
      const returnTo = sanitizeReturnTo(url.searchParams.get('return_to'));

      // Validate redirect_uri if provided (for native apps)
      if (redirectUri && !isValidRedirectUri(redirectUri)) {
        return applyCors(jsonError('Invalid redirect_uri', 400), corsOrigin);
      }

      try {
        // Create and store OAuth state with provider (now includes return_to)
        const state = await createOAuthState(env.DB, platform, redirectUri, 'google', returnTo);

        // Build callback URL (always points to our worker)
        const callbackUrl = new URL('/api/auth/google/callback', url.origin).toString();

        // Build Google authorization URL
        const googleAuthUrl = buildGoogleAuthUrl(env.GOOGLE_CLIENT_ID, callbackUrl, state);

        // Redirect to Google
        return Response.redirect(googleAuthUrl, 302);
      } catch (e) {
        console.error('Google OAuth start error:', e);
        return applyCors(jsonError('Failed to start OAuth flow', 500), corsOrigin);
      }
    }

    // Google OAuth callback
    if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return applyCors(jsonError('Google OAuth not configured', 500), corsOrigin);
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      // For early errors before state validation, we need to try to get redirectUri from state
      // But state validation consumes it, so for OAuth errors we validate without consuming
      let earlyRedirectUri: string | null = null;
      if (state && (error || !code)) {
        // Peek at state to get redirectUri for error redirect (don't consume yet)
        const stateRow = await env.DB.prepare(
          'SELECT redirect_uri FROM oauth_states WHERE state = ?1'
        )
          .bind(state)
          .first<{ redirect_uri: string | null }>();
        earlyRedirectUri = stateRow?.redirect_uri || null;
      }

      // Handle OAuth error from Google
      if (error) {
        const errorDesc = url.searchParams.get('error_description') || 'Authorization denied';
        console.error('Google OAuth error:', error, errorDesc);
        // Clean up the state since we won't use it
        if (state) {
          await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?1').bind(state).run();
        }
        const failureUrl = safeRedirectUrl(earlyRedirectUri);
        failureUrl.searchParams.set('auth', 'error');
        failureUrl.searchParams.set('error', errorDesc);
        return Response.redirect(failureUrl.toString(), 302);
      }

      if (!code || !state) {
        return applyCors(jsonError('Missing code or state', 400), corsOrigin);
      }

      try {
        // Validate state (this consumes it)
        const stateData = await validateOAuthState(env.DB, state);
        if (!stateData) {
          const failureUrl = safeRedirectUrl(earlyRedirectUri);
          failureUrl.searchParams.set('auth', 'error');
          failureUrl.searchParams.set('error', 'Invalid or expired state');
          return Response.redirect(failureUrl.toString(), 302);
        }

        // Now we have the proper redirectUri from validated state
        const appUrl = stateData.redirectUri || DEFAULT_APP_BASE_URL;

        // Exchange code for token
        const callbackUrl = new URL('/api/auth/google/callback', url.origin).toString();
        const accessToken = await exchangeGoogleCodeForToken(
          env.GOOGLE_CLIENT_ID,
          env.GOOGLE_CLIENT_SECRET,
          code,
          callbackUrl
        );

        if (!accessToken) {
          const failureUrl = new URL(appUrl);
          failureUrl.searchParams.set('auth', 'error');
          failureUrl.searchParams.set('error', 'Failed to exchange code for token');
          return Response.redirect(failureUrl.toString(), 302);
        }

        // Fetch Google user info
        const googleUser = await fetchGoogleUser(accessToken);
        if (!googleUser) {
          const failureUrl = new URL(appUrl);
          failureUrl.searchParams.set('auth', 'error');
          failureUrl.searchParams.set('error', 'Failed to fetch user info');
          return Response.redirect(failureUrl.toString(), 302);
        }

        // Find or create user
        const user = await findOrCreateUserFromGoogle(env.DB, googleUser);

        // Create session
        const session = await createSession(env.DB, user.id);

        // Handle redirect based on platform and origin
        const successUrl = new URL(appUrl);

        // Check if this is a cross-origin redirect (different host than API)
        const isCrossOrigin =
          stateData.platform === 'native' ||
          successUrl.hostname === 'localhost' ||
          successUrl.hostname === '127.0.0.1' ||
          successUrl.origin !== url.origin;

        if (isCrossOrigin) {
          // For cross-origin: use exchange token in URL fragment (cookies won't work cross-origin)
          // Using fragment prevents token leakage via Referer header
          const exchangeToken = await createExchangeToken(env.DB, user.id);
          const fragmentParams = new URLSearchParams();
          fragmentParams.set('exchange_token', exchangeToken);
          fragmentParams.set('auth', 'success');
          if (stateData.returnTo) {
            fragmentParams.set('return_to', stateData.returnTo);
          }

          // For custom schemes (exp://, queueup://), URL.origin returns 'null' (as string)
          // so we need to construct the base URL manually
          const baseUrl =
            successUrl.origin !== 'null' && successUrl.origin
              ? `${successUrl.origin}${successUrl.pathname}`
              : `${successUrl.protocol}//${successUrl.host}${successUrl.pathname}`;
          const redirectUrl = `${baseUrl}#${fragmentParams.toString()}`;

          // For native apps with custom schemes (exp://, queueup://), browsers can't redirect directly.
          // We need to return an HTML page that triggers the redirect via JavaScript.
          const isCustomScheme =
            successUrl.protocol === 'exp:' || successUrl.protocol === 'queueup:';

          if (isCustomScheme) {
            // Return an HTML page that redirects to the custom scheme
            const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 20px; }
    .spinner { width: 40px; height: 40px; border: 3px solid #ddd; border-top-color: #333; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    a { color: #007AFF; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Redirecting back to the app...</p>
    <p><a href="${redirectUrl}" id="link">Click here if not redirected</a></p>
  </div>
  <script>
    window.location.href = "${redirectUrl}";
  </script>
</body>
</html>`;
            return new Response(html, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            });
          }

          return Response.redirect(redirectUrl, 302);
        }

        // For same-origin web: set HttpOnly cookie and redirect
        successUrl.searchParams.set('auth', 'success');
        // Pass through return_to for post-auth navigation
        if (stateData.returnTo) {
          successUrl.searchParams.set('return_to', stateData.returnTo);
        }

        const sessionCookieMaxAge = 14 * 24 * 60 * 60; // 14 days
        const headers = new Headers({
          Location: successUrl.toString(),
        });
        headers.append('Set-Cookie', buildSessionCookie(session.id, sessionCookieMaxAge));

        return new Response(null, { status: 302, headers });
      } catch (e) {
        console.error('Google OAuth callback error:', e);
        const failureUrl = safeRedirectUrl(earlyRedirectUri);
        failureUrl.searchParams.set('auth', 'error');
        failureUrl.searchParams.set('error', 'Authentication failed');
        return Response.redirect(failureUrl.toString(), 302);
      }
    }

    // Exchange token for session (native apps)
    if (request.method === 'POST' && url.pathname === '/api/auth/exchange') {
      // Rate limit: 10 attempts per minute per IP
      const clientIp = getClientIp(request);
      if (await isRateLimited(env, `exchange:${clientIp}`, 10, 60, true)) {
        return applyCors(jsonError('Too many requests', 429), corsOrigin);
      }

      try {
        const payload = await readJson(request);
        const exchangeToken = payload?.exchange_token;

        if (!exchangeToken || typeof exchangeToken !== 'string') {
          return applyCors(jsonError('exchange_token required', 400), corsOrigin);
        }

        // Validate and consume exchange token
        const userId = await validateExchangeToken(env.DB, exchangeToken);
        if (!userId) {
          return applyCors(jsonError('Invalid or expired exchange token', 401), corsOrigin);
        }

        // Create a new session
        const session = await createSession(env.DB, userId);

        // Get user info
        const user = await validateSession(env.DB, session.id);

        return applyCors(
          new Response(
            JSON.stringify({
              session_token: session.id,
              user: user
                ? {
                    id: user.id,
                    github_username: user.github_username,
                    github_avatar_url: user.github_avatar_url,
                    google_name: user.google_name,
                    google_email: user.google_email,
                    google_avatar_url: user.google_avatar_url,
                    email: user.email,
                    is_admin: isAdmin(user, env.ADMIN_EMAILS),
                  }
                : null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          ),
          corsOrigin
        );
      } catch (e) {
        console.error('Exchange token error:', e);
        return applyCors(jsonError('Token exchange failed', 500), corsOrigin);
      }
    }

    // Get current user
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      try {
        const sessionId = getSessionFromRequest(request);
        if (!sessionId) {
          return applyCors(
            new Response(JSON.stringify({ user: null }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
            corsOrigin
          );
        }

        const user = await validateSession(env.DB, sessionId);
        if (!user) {
          return applyCors(
            new Response(JSON.stringify({ user: null }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
            corsOrigin
          );
        }

        return applyCors(
          new Response(
            JSON.stringify({
              user: {
                id: user.id,
                github_username: user.github_username,
                github_avatar_url: user.github_avatar_url,
                google_name: user.google_name,
                google_email: user.google_email,
                google_avatar_url: user.google_avatar_url,
                email: user.email,
                is_admin: isAdmin(user, env.ADMIN_EMAILS),
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          ),
          corsOrigin
        );
      } catch (e) {
        console.error('Auth me error:', e);
        return applyCors(jsonError('Failed to get user', 500), corsOrigin);
      }
    }

    // Logout
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      try {
        const sessionId = getSessionFromRequest(request);
        if (sessionId) {
          await deleteSession(env.DB, sessionId);
        }

        const headers = new Headers({
          'content-type': 'application/json',
        });
        headers.append('Set-Cookie', buildClearSessionCookie());

        return applyCors(
          new Response(JSON.stringify({ success: true }), { status: 200, headers }),
          corsOrigin
        );
      } catch (e) {
        console.error('Logout error:', e);
        return applyCors(jsonError('Logout failed', 500), corsOrigin);
      }
    }

    // Logout from all devices
    if (request.method === 'POST' && url.pathname === '/api/auth/logout-all') {
      try {
        const sessionId = getSessionFromRequest(request);
        if (!sessionId) {
          return applyCors(jsonError('Authentication required', 401), corsOrigin);
        }

        const user = await validateSession(env.DB, sessionId);
        if (!user) {
          return applyCors(jsonError('Invalid session', 401), corsOrigin);
        }

        // Delete all sessions for this user
        const deletedCount = await deleteAllUserSessions(env.DB, user.id);

        const headers = new Headers({
          'content-type': 'application/json',
        });
        headers.append('Set-Cookie', buildClearSessionCookie());

        return applyCors(
          new Response(JSON.stringify({ success: true, sessionsRevoked: deletedCount }), {
            status: 200,
            headers,
          }),
          corsOrigin
        );
      } catch (e) {
        console.error('Logout all error:', e);
        return applyCors(jsonError('Logout failed', 500), corsOrigin);
      }
    }

    // ============================================
    // Push API Routes
    // ============================================

    // Push API: VAPID public key
    if (request.method === 'GET' && url.pathname === '/api/push/vapid') {
      const body = JSON.stringify({ publicKey: env.VAPID_PUBLIC ?? null });
      return applyCors(
        new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
        corsOrigin
      );
    }

    // ============================================
    // Host Dashboard / Queue Management Routes
    // ============================================

    // GET /api/queues/mine - List all queues owned by the authenticated user
    if (request.method === 'GET' && url.pathname === '/api/queues/mine') {
      try {
        const sessionId = getSessionFromRequest(request);
        if (!sessionId) {
          return applyCors(jsonError('Authentication required', 401), corsOrigin);
        }

        const user = await validateSession(env.DB, sessionId);
        if (!user) {
          return applyCors(jsonError('Invalid session', 401), corsOrigin);
        }

        // Get all queues owned by this user with stats
        const result = await env.DB.prepare(
          `SELECT 
            s.id,
            s.short_code,
            s.event_name,
            s.status,
            s.created_at,
            s.max_guests,
            s.location,
            s.contact_info,
            s.open_time,
            s.close_time,
            s.requires_auth,
            (SELECT COUNT(*) FROM parties p WHERE p.session_id = s.id AND p.status IN ('waiting', 'called')) as active_count,
            (SELECT COUNT(*) FROM parties p WHERE p.session_id = s.id AND p.status = 'served') as served_count,
            (SELECT COUNT(*) FROM parties p WHERE p.session_id = s.id AND p.status = 'left') as left_count,
            (SELECT COUNT(*) FROM parties p WHERE p.session_id = s.id AND p.status = 'no_show') as no_show_count,
            (SELECT AVG((p.completed_at - p.joined_at)) FROM parties p 
              WHERE p.session_id = s.id AND p.status = 'served' AND p.completed_at IS NOT NULL) as avg_wait_seconds
          FROM sessions s
          WHERE s.owner_id = ?1
          ORDER BY s.created_at DESC`
        )
          .bind(user.id)
          .all<{
            id: string;
            short_code: string;
            event_name: string | null;
            status: string;
            created_at: number;
            max_guests: number | null;
            location: string | null;
            contact_info: string | null;
            open_time: string | null;
            close_time: string | null;
            requires_auth: number;
            active_count: number;
            served_count: number;
            left_count: number;
            no_show_count: number;
            avg_wait_seconds: number | null;
          }>();

        const queues = (result.results || []).map((q) => ({
          id: q.id,
          shortCode: q.short_code,
          eventName: q.event_name,
          status: q.status,
          createdAt: q.created_at,
          maxGuests: q.max_guests,
          location: q.location,
          contactInfo: q.contact_info,
          openTime: q.open_time,
          closeTime: q.close_time,
          requiresAuth: q.requires_auth === 1,
          stats: {
            activeCount: q.active_count,
            servedCount: q.served_count,
            leftCount: q.left_count,
            noShowCount: q.no_show_count,
            avgWaitSeconds: q.avg_wait_seconds,
          },
        }));

        return applyCors(
          new Response(JSON.stringify({ queues }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
          corsOrigin
        );
      } catch (e) {
        console.error('queues/mine error:', e);
        return applyCors(jsonError('Failed to fetch queues', 500), corsOrigin);
      }
    }

    // GET /api/user/memberships - List all queues the authenticated user has joined as a guest
    if (request.method === 'GET' && url.pathname === '/api/user/memberships') {
      try {
        const sessionId = getSessionFromRequest(request);
        if (!sessionId) {
          return applyCors(jsonError('Authentication required', 401), corsOrigin);
        }

        const user = await validateSession(env.DB, sessionId);
        if (!user) {
          return applyCors(jsonError('Invalid session', 401), corsOrigin);
        }

        // Get all queues the user has joined as a guest (where user_id matches)
        const result = await env.DB.prepare(
          `SELECT 
            p.id as party_id,
            p.session_id,
            p.name,
            p.size,
            p.status,
            p.joined_at,
            p.called_at,
            p.completed_at,
            s.short_code,
            s.event_name,
            s.status as queue_status,
            s.location,
            s.contact_info
          FROM parties p
          INNER JOIN sessions s ON p.session_id = s.id
          WHERE p.user_id = ?1
          ORDER BY p.joined_at DESC`
        )
          .bind(user.id)
          .all<{
            party_id: string;
            session_id: string;
            name: string | null;
            size: number;
            status: string;
            joined_at: number;
            called_at: number | null;
            completed_at: number | null;
            short_code: string;
            event_name: string | null;
            queue_status: string;
            location: string | null;
            contact_info: string | null;
          }>();

        const memberships = (result.results || []).map((m) => ({
          partyId: m.party_id,
          sessionId: m.session_id,
          name: m.name,
          size: m.size,
          status: m.status,
          joinedAt: m.joined_at,
          calledAt: m.called_at,
          completedAt: m.completed_at,
          queue: {
            shortCode: m.short_code,
            eventName: m.event_name,
            status: m.queue_status,
            location: m.location,
            contactInfo: m.contact_info,
          },
        }));

        return applyCors(
          new Response(JSON.stringify({ memberships }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
          corsOrigin
        );
      } catch (e) {
        console.error('user/memberships error:', e);
        return applyCors(jsonError('Failed to fetch memberships', 500), corsOrigin);
      }
    }

    // POST /api/user/claim-queues - Claim localStorage queues to user account on login
    if (request.method === 'POST' && url.pathname === '/api/user/claim-queues') {
      try {
        const sessionId = getSessionFromRequest(request);
        if (!sessionId) {
          return applyCors(jsonError('Authentication required', 401), corsOrigin);
        }

        const user = await validateSession(env.DB, sessionId);
        if (!user) {
          return applyCors(jsonError('Invalid session', 401), corsOrigin);
        }

        const payload = await readJson(request);
        if (!payload || typeof payload !== 'object') {
          return applyCors(jsonError('Invalid request body', 400), corsOrigin);
        }

        const { ownedQueues, joinedQueues } = payload as {
          ownedQueues?: Array<{ sessionId: string; hostAuthToken: string }>;
          joinedQueues?: Array<{ sessionId: string; partyId: string }>;
        };

        let claimedOwned = 0;
        let claimedJoined = 0;

        // Claim owned queues (verify host auth token)
        if (ownedQueues && Array.isArray(ownedQueues)) {
          for (const queue of ownedQueues) {
            if (!queue.sessionId || !queue.hostAuthToken) continue;

            // Verify the host auth token is valid for this session
            const isValid = await verifyHostCookie(
              queue.hostAuthToken,
              queue.sessionId,
              env.HOST_AUTH_SECRET
            );
            if (isValid) {
              // Update the session to set owner_id (only if not already owned by someone else)
              const updateResult = await env.DB.prepare(
                `UPDATE sessions SET owner_id = ?1 WHERE id = ?2 AND (owner_id IS NULL OR owner_id = ?1)`
              )
                .bind(user.id, queue.sessionId)
                .run();
              if (updateResult.meta.changes > 0) {
                claimedOwned++;
              }
            }
          }
        }

        // Claim joined queues (update user_id on parties)
        if (joinedQueues && Array.isArray(joinedQueues)) {
          for (const queue of joinedQueues) {
            if (!queue.sessionId || !queue.partyId) continue;

            // Update the party to set user_id (only if not already claimed by someone else)
            const updateResult = await env.DB.prepare(
              `UPDATE parties SET user_id = ?1 WHERE id = ?2 AND session_id = ?3 AND (user_id IS NULL OR user_id = ?1)`
            )
              .bind(user.id, queue.partyId, queue.sessionId)
              .run();
            if (updateResult.meta.changes > 0) {
              claimedJoined++;
            }
          }
        }

        return applyCors(
          new Response(
            JSON.stringify({
              success: true,
              claimedOwned,
              claimedJoined,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
          corsOrigin
        );
      } catch (e) {
        console.error('user/claim-queues error:', e);
        return applyCors(jsonError('Failed to claim queues', 500), corsOrigin);
      }
    }

    // GET /api/queues/:id/stats - Get detailed stats for a single queue (owner only)
    const queueStatsMatch = /^\/api\/queues\/([A-Za-z0-9-]+)\/stats$/.exec(url.pathname);
    if (request.method === 'GET' && queueStatsMatch) {
      try {
        const queueId = queueStatsMatch[1];

        const sessionId = getSessionFromRequest(request);
        if (!sessionId) {
          return applyCors(jsonError('Authentication required', 401), corsOrigin);
        }

        const user = await validateSession(env.DB, sessionId);
        if (!user) {
          return applyCors(jsonError('Invalid session', 401), corsOrigin);
        }

        // Verify ownership
        const queue = await env.DB.prepare(
          'SELECT id, owner_id, event_name, status, short_code FROM sessions WHERE id = ?1'
        )
          .bind(queueId)
          .first<{
            id: string;
            owner_id: string | null;
            event_name: string | null;
            status: string;
            short_code: string;
          }>();

        if (!queue) {
          return applyCors(jsonError('Queue not found', 404), corsOrigin);
        }

        if (queue.owner_id !== user.id) {
          return applyCors(jsonError('Not authorized to view this queue', 403), corsOrigin);
        }

        // Get detailed stats
        const partyStats = await env.DB.prepare(
          `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('waiting', 'called') THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as served,
            SUM(CASE WHEN status = 'left' THEN 1 ELSE 0 END) as left,
            SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show,
            SUM(CASE WHEN status = 'kicked' THEN 1 ELSE 0 END) as kicked
          FROM parties WHERE session_id = ?1`
        )
          .bind(queueId)
          .first<{
            total: number;
            active: number;
            served: number;
            left: number;
            no_show: number;
            kicked: number;
          }>();

        const waitTimeStats = await env.DB.prepare(
          `SELECT 
            AVG((completed_at - joined_at)) as avg_wait_seconds,
            MIN((completed_at - joined_at)) as min_wait_seconds,
            MAX((completed_at - joined_at)) as max_wait_seconds
          FROM parties 
          WHERE session_id = ?1 AND status = 'served' AND completed_at IS NOT NULL`
        )
          .bind(queueId)
          .first<{
            avg_wait_seconds: number | null;
            min_wait_seconds: number | null;
            max_wait_seconds: number | null;
          }>();

        // Get hourly activity for the last 24 hours
        const hourlyActivity = await env.DB.prepare(
          `SELECT 
            strftime('%H', datetime(joined_at, 'unixepoch')) as hour,
            COUNT(*) as count
          FROM parties 
          WHERE session_id = ?1 AND joined_at > strftime('%s', 'now') - 86400
          GROUP BY hour
          ORDER BY hour`
        )
          .bind(queueId)
          .all<{ hour: string; count: number }>();

        return applyCors(
          new Response(
            JSON.stringify({
              queue: {
                id: queue.id,
                eventName: queue.event_name,
                status: queue.status,
                shortCode: queue.short_code,
              },
              stats: {
                parties: partyStats || {
                  total: 0,
                  active: 0,
                  served: 0,
                  left: 0,
                  no_show: 0,
                  kicked: 0,
                },
                waitTime: waitTimeStats || {
                  avg_wait_seconds: null,
                  min_wait_seconds: null,
                  max_wait_seconds: null,
                },
                hourlyActivity: hourlyActivity.results || [],
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
          corsOrigin
        );
      } catch (e) {
        console.error('queue stats error:', e);
        return applyCors(jsonError('Failed to fetch queue stats', 500), corsOrigin);
      }
    }

    // Push API: subscribe
    if (request.method === 'POST' && url.pathname === '/api/push/subscribe') {
      try {
        const { sessionId, partyId, subscription } = (await readJson(request)) ?? {};
        if (
          !sessionId ||
          !partyId ||
          !subscription ||
          !subscription.endpoint ||
          !subscription.keys
        ) {
          return applyCors(jsonError('Invalid subscription payload', 400), corsOrigin);
        }
        const { endpoint, keys } = subscription as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        await env.DB.prepare(
          `INSERT INTO push_subscriptions (session_id, party_id, endpoint, p256dh, auth)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(endpoint) DO UPDATE SET
               session_id=excluded.session_id,
               party_id=excluded.party_id,
               p256dh=excluded.p256dh,
               auth=excluded.auth,
               created_at=strftime('%s','now')`
        )
          .bind(sessionId, partyId, endpoint, keys.p256dh, keys.auth)
          .run();

        if (env.VAPID_PUBLIC && env.VAPID_PRIVATE) {
          ctx.waitUntil(
            sendPushNotification(env, {
              sessionId,
              partyId,
              subscription: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
              title: 'You joined the queue',
              body: 'We will alert you as you get closer to the front.',
              url: buildAppUrl(env),
              kind: 'join_confirm',
            }).catch((err) => console.warn('join push error', err))
          );
        }
        return applyCors(new Response('ok'), corsOrigin);
      } catch (e) {
        console.error('subscribe error', e);
        return applyCors(new Response('fail', { status: 500 }), corsOrigin);
      }
    }

    // Analytics dashboard data
    if (request.method === 'GET' && url.pathname === '/api/analytics') {
      // Require admin authentication
      const { error: adminError } = await requireAdmin(env.DB, request, env.ADMIN_EMAILS);
      if (adminError) {
        return applyCors(adminError, corsOrigin);
      }

      try {
        const days = parseInt(url.searchParams.get('days') || '7', 10);
        const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

        // Get event counts by type
        const eventCountsResult = await env.DB.prepare(
          `SELECT type, COUNT(*) as count FROM events WHERE ts > ?1 GROUP BY type ORDER BY count DESC`
        )
          .bind(since)
          .all<{ type: string; count: number }>();

        // Get daily event counts
        const dailyEventsResult = await env.DB.prepare(
          `SELECT date(ts, 'unixepoch') as day, COUNT(*) as count FROM events WHERE ts > ?1 GROUP BY day ORDER BY day`
        )
          .bind(since)
          .all<{ day: string; count: number }>();

        // Get queue creation stats
        const queueStatsResult = await env.DB.prepare(
          `SELECT 
            COUNT(*) as total_queues,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_queues,
            SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_queues
          FROM sessions WHERE created_at > ?1`
        )
          .bind(since)
          .first<{ total_queues: number; active_queues: number; closed_queues: number }>();

        // Get party outcome stats
        const partyStatsResult = await env.DB.prepare(
          `SELECT 
            status,
            COUNT(*) as count
          FROM parties WHERE joined_at > ?1 GROUP BY status`
        )
          .bind(since)
          .all<{ status: string; count: number }>();

        // Get push notification stats
        const pushStatsResult = await env.DB.prepare(
          `SELECT 
            SUM(CASE WHEN type = 'push_prompt_shown' THEN 1 ELSE 0 END) as prompts_shown,
            SUM(CASE WHEN type = 'push_granted' THEN 1 ELSE 0 END) as push_granted,
            SUM(CASE WHEN type = 'push_denied' THEN 1 ELSE 0 END) as push_denied,
            SUM(CASE WHEN type = 'nudge_sent' THEN 1 ELSE 0 END) as nudges_sent,
            SUM(CASE WHEN type = 'nudge_ack' THEN 1 ELSE 0 END) as nudges_acked
          FROM events WHERE ts > ?1`
        )
          .bind(since)
          .first<{
            prompts_shown: number;
            push_granted: number;
            push_denied: number;
            nudges_sent: number;
            nudges_acked: number;
          }>();

        // Get join funnel stats
        const joinFunnelResult = await env.DB.prepare(
          `SELECT 
            SUM(CASE WHEN type = 'qr_scanned' THEN 1 ELSE 0 END) as qr_scanned,
            SUM(CASE WHEN type = 'join_started' THEN 1 ELSE 0 END) as join_started,
            SUM(CASE WHEN type = 'join_completed' THEN 1 ELSE 0 END) as join_completed,
            SUM(CASE WHEN type = 'abandon_after_eta' THEN 1 ELSE 0 END) as abandoned
          FROM events WHERE ts > ?1`
        )
          .bind(since)
          .first<{
            qr_scanned: number;
            join_started: number;
            join_completed: number;
            abandoned: number;
          }>();

        // Get platform breakdown
        const platformResult = await env.DB.prepare(
          `SELECT 
            json_extract(details, '$.platform') as platform,
            COUNT(*) as count
          FROM events 
          WHERE ts > ?1 AND json_extract(details, '$.platform') IS NOT NULL
          GROUP BY platform`
        )
          .bind(since)
          .all<{ platform: string; count: number }>();

        // Get host action stats
        const hostActionsResult = await env.DB.prepare(
          `SELECT 
            SUM(CASE WHEN type = 'queue_create_completed' THEN 1 ELSE 0 END) as queues_created,
            SUM(CASE WHEN type = 'host_call_next' THEN 1 ELSE 0 END) as call_next,
            SUM(CASE WHEN type = 'host_call_specific' THEN 1 ELSE 0 END) as call_specific,
            SUM(CASE WHEN type = 'host_close_queue' THEN 1 ELSE 0 END) as queues_closed
          FROM events WHERE ts > ?1`
        )
          .bind(since)
          .first<{
            queues_created: number;
            call_next: number;
            call_specific: number;
            queues_closed: number;
          }>();

        // Get wait time stats for served parties
        const waitTimeResult = await env.DB.prepare(
          `SELECT 
            COUNT(*) as total_served,
            AVG((completed_at - joined_at) * 1000) as avg_wait_ms,
            MIN((completed_at - joined_at) * 1000) as min_wait_ms,
            MAX((completed_at - joined_at) * 1000) as max_wait_ms
          FROM parties 
          WHERE joined_at > ?1 
            AND status = 'served' 
            AND completed_at IS NOT NULL`
        )
          .bind(since)
          .first<{
            total_served: number;
            avg_wait_ms: number | null;
            min_wait_ms: number | null;
            max_wait_ms: number | null;
          }>();

        // Get abandonment stats with wait time correlation
        const abandonmentResult = await env.DB.prepare(
          `SELECT 
            COUNT(*) as total_left,
            AVG(wait_ms_at_leave) as avg_wait_ms_at_leave,
            AVG(position_at_leave) as avg_position_at_leave,
            SUM(CASE WHEN wait_ms_at_leave < 300000 THEN 1 ELSE 0 END) as left_under_5min,
            SUM(CASE WHEN wait_ms_at_leave >= 300000 AND wait_ms_at_leave < 900000 THEN 1 ELSE 0 END) as left_5_to_15min,
            SUM(CASE WHEN wait_ms_at_leave >= 900000 THEN 1 ELSE 0 END) as left_over_15min
          FROM parties 
          WHERE joined_at > ?1 
            AND status = 'left'
            AND wait_ms_at_leave IS NOT NULL`
        )
          .bind(since)
          .first<{
            total_left: number;
            avg_wait_ms_at_leave: number | null;
            avg_position_at_leave: number | null;
            left_under_5min: number;
            left_5_to_15min: number;
            left_over_15min: number;
          }>();

        // Get per-queue performance breakdown (top 10 queues by activity)
        const perQueueResult = await env.DB.prepare(
          `SELECT 
            s.id as session_id,
            s.event_name,
            s.short_code,
            COUNT(DISTINCT p.id) as total_parties,
            SUM(CASE WHEN p.status = 'served' THEN 1 ELSE 0 END) as served_count,
            SUM(CASE WHEN p.status = 'left' THEN 1 ELSE 0 END) as left_count,
            SUM(CASE WHEN p.status = 'no_show' THEN 1 ELSE 0 END) as no_show_count,
            AVG(CASE WHEN p.status = 'served' AND p.completed_at IS NOT NULL THEN (p.completed_at - p.joined_at) * 1000 ELSE NULL END) as avg_wait_ms
          FROM sessions s
          LEFT JOIN parties p ON s.id = p.session_id
          WHERE s.created_at > ?1
          GROUP BY s.id
          ORDER BY total_parties DESC
          LIMIT 10`
        )
          .bind(since)
          .all<{
            session_id: string;
            event_name: string | null;
            short_code: string;
            total_parties: number;
            served_count: number;
            left_count: number;
            no_show_count: number;
            avg_wait_ms: number | null;
          }>();

        // Get ETA accuracy stats (compare estimated_wait_ms to actual wait time)
        const etaAccuracyResult = await env.DB.prepare(
          `SELECT 
            COUNT(*) as total_with_eta,
            AVG(ABS((completed_at - joined_at) * 1000 - estimated_wait_ms)) as avg_error_ms,
            AVG((completed_at - joined_at) * 1000 - estimated_wait_ms) as avg_bias_ms,
            SUM(CASE WHEN ABS((completed_at - joined_at) * 1000 - estimated_wait_ms) <= 120000 THEN 1 ELSE 0 END) as within_2min,
            SUM(CASE WHEN ABS((completed_at - joined_at) * 1000 - estimated_wait_ms) <= 300000 THEN 1 ELSE 0 END) as within_5min
          FROM parties 
          WHERE joined_at > ?1 
            AND status = 'served' 
            AND completed_at IS NOT NULL
            AND estimated_wait_ms IS NOT NULL`
        )
          .bind(since)
          .first<{
            total_with_eta: number;
            avg_error_ms: number | null;
            avg_bias_ms: number | null;
            within_2min: number;
            within_5min: number;
          }>();

        // Get trust survey stats
        const trustSurveyResult = await env.DB.prepare(
          `SELECT 
            COUNT(*) as total_responses,
            SUM(CASE WHEN json_extract(details, '$.trust') = 'yes' THEN 1 ELSE 0 END) as trust_yes,
            SUM(CASE WHEN json_extract(details, '$.trust') = 'no' THEN 1 ELSE 0 END) as trust_no
          FROM events 
          WHERE ts > ?1 AND type = 'trust_survey_submitted'`
        )
          .bind(since)
          .first<{
            total_responses: number;
            trust_yes: number;
            trust_no: number;
          }>();

        // Get completion rate by wait time bucket
        const completionByWaitResult = await env.DB.prepare(
          `SELECT 
            CASE 
              WHEN (completed_at - joined_at) * 1000 < 300000 THEN 'under_5min'
              WHEN (completed_at - joined_at) * 1000 < 900000 THEN '5_to_15min'
              WHEN (completed_at - joined_at) * 1000 < 1800000 THEN '15_to_30min'
              ELSE 'over_30min'
            END as wait_bucket,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as served,
            SUM(CASE WHEN status = 'left' THEN 1 ELSE 0 END) as left,
            SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
          FROM parties 
          WHERE joined_at > ?1 
            AND completed_at IS NOT NULL
            AND status IN ('served', 'left', 'no_show')
          GROUP BY wait_bucket
          ORDER BY 
            CASE wait_bucket
              WHEN 'under_5min' THEN 1
              WHEN '5_to_15min' THEN 2
              WHEN '15_to_30min' THEN 3
              ELSE 4
            END`
        )
          .bind(since)
          .all<{
            wait_bucket: string;
            total: number;
            served: number;
            left: number;
            no_show: number;
          }>();

        const analytics = {
          period: { days, since: new Date(since * 1000).toISOString() },
          eventCounts: eventCountsResult.results || [],
          dailyEvents: dailyEventsResult.results || [],
          queueStats: queueStatsResult || { total_queues: 0, active_queues: 0, closed_queues: 0 },
          partyStats: partyStatsResult.results || [],
          pushStats: pushStatsResult || {
            prompts_shown: 0,
            push_granted: 0,
            push_denied: 0,
            nudges_sent: 0,
            nudges_acked: 0,
          },
          joinFunnel: joinFunnelResult || {
            qr_scanned: 0,
            join_started: 0,
            join_completed: 0,
            abandoned: 0,
          },
          platformBreakdown: platformResult.results || [],
          hostActions: hostActionsResult || {
            queues_created: 0,
            call_next: 0,
            call_specific: 0,
            queues_closed: 0,
          },
          waitTimeStats: waitTimeResult || {
            total_served: 0,
            avg_wait_ms: null,
            min_wait_ms: null,
            max_wait_ms: null,
          },
          abandonmentStats: abandonmentResult || {
            total_left: 0,
            avg_wait_ms_at_leave: null,
            avg_position_at_leave: null,
            left_under_5min: 0,
            left_5_to_15min: 0,
            left_over_15min: 0,
          },
          perQueueStats: perQueueResult.results || [],
          etaAccuracyStats: etaAccuracyResult || {
            total_with_eta: 0,
            avg_error_ms: null,
            avg_bias_ms: null,
            within_2min: 0,
            within_5min: 0,
          },
          completionByWait: completionByWaitResult.results || [],
          trustSurveyStats: trustSurveyResult || {
            total_responses: 0,
            trust_yes: 0,
            trust_no: 0,
          },
        };

        return applyCors(
          new Response(JSON.stringify(analytics), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
          corsOrigin
        );
      } catch (e) {
        console.error('analytics error', e);
        return applyCors(new Response('Analytics query failed', { status: 500 }), corsOrigin);
      }
    }

    // Analytics CSV export endpoint
    if (request.method === 'GET' && url.pathname === '/api/analytics/export') {
      // Require admin authentication
      const { error: adminError } = await requireAdmin(env.DB, request, env.ADMIN_EMAILS);
      if (adminError) {
        return applyCors(adminError, corsOrigin);
      }

      try {
        const days = parseInt(url.searchParams.get('days') || '7', 10);
        const dataType = url.searchParams.get('type') || 'parties';
        const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

        let csv = '';
        let filename = '';

        if (dataType === 'parties') {
          // Export party data with wait times
          const result = await env.DB.prepare(
            `SELECT 
              p.id,
              p.session_id,
              s.event_name,
              s.short_code,
              p.name,
              p.size,
              datetime(p.joined_at, 'unixepoch') as joined_at,
              p.status,
              datetime(p.called_at, 'unixepoch') as called_at,
              datetime(p.completed_at, 'unixepoch') as completed_at,
              CASE WHEN p.completed_at IS NOT NULL AND p.joined_at IS NOT NULL 
                THEN (p.completed_at - p.joined_at) 
                ELSE NULL 
              END as wait_seconds,
              p.estimated_wait_ms / 1000 as estimated_wait_seconds,
              p.position_at_leave,
              p.wait_ms_at_leave / 1000 as wait_at_leave_seconds
            FROM parties p
            LEFT JOIN sessions s ON p.session_id = s.id
            WHERE p.joined_at > ?1
            ORDER BY p.joined_at DESC`
          )
            .bind(since)
            .all<{
              id: string;
              session_id: string;
              event_name: string | null;
              short_code: string | null;
              name: string | null;
              size: number | null;
              joined_at: string | null;
              status: string;
              called_at: string | null;
              completed_at: string | null;
              wait_seconds: number | null;
              estimated_wait_seconds: number | null;
              position_at_leave: number | null;
              wait_at_leave_seconds: number | null;
            }>();

          csv =
            'id,session_id,event_name,short_code,name,size,joined_at,status,called_at,completed_at,wait_seconds,estimated_wait_seconds,position_at_leave,wait_at_leave_seconds\n';
          for (const row of result.results || []) {
            csv += `"${row.id}","${row.session_id}","${row.event_name || ''}","${row.short_code || ''}","${(row.name || '').replace(/"/g, '""')}",${row.size || 1},"${row.joined_at || ''}","${row.status}","${row.called_at || ''}","${row.completed_at || ''}",${row.wait_seconds ?? ''},${row.estimated_wait_seconds ?? ''},${row.position_at_leave ?? ''},${row.wait_at_leave_seconds ?? ''}\n`;
          }
          filename = `parties_export_${days}d.csv`;
        } else if (dataType === 'events') {
          // Export event data
          const result = await env.DB.prepare(
            `SELECT 
              e.id,
              e.session_id,
              e.party_id,
              e.type,
              datetime(e.ts, 'unixepoch') as timestamp,
              e.details
            FROM events e
            WHERE e.ts > ?1
            ORDER BY e.ts DESC
            LIMIT 10000`
          )
            .bind(since)
            .all<{
              id: number;
              session_id: string | null;
              party_id: string | null;
              type: string;
              timestamp: string;
              details: string | null;
            }>();

          csv = 'id,session_id,party_id,type,timestamp,details\n';
          for (const row of result.results || []) {
            csv += `${row.id},"${row.session_id || ''}","${row.party_id || ''}","${row.type}","${row.timestamp}","${(row.details || '').replace(/"/g, '""')}"\n`;
          }
          filename = `events_export_${days}d.csv`;
        } else if (dataType === 'queues') {
          // Export queue/session data
          const result = await env.DB.prepare(
            `SELECT 
              s.id,
              s.short_code,
              s.event_name,
              s.status,
              datetime(s.created_at, 'unixepoch') as created_at,
              s.max_guests,
              s.location,
              s.contact_info,
              s.open_time,
              s.close_time,
              (SELECT COUNT(*) FROM parties p WHERE p.session_id = s.id) as total_parties,
              (SELECT COUNT(*) FROM parties p WHERE p.session_id = s.id AND p.status = 'served') as served_count,
              (SELECT COUNT(*) FROM parties p WHERE p.session_id = s.id AND p.status = 'left') as left_count,
              (SELECT AVG((p.completed_at - p.joined_at)) FROM parties p WHERE p.session_id = s.id AND p.status = 'served' AND p.completed_at IS NOT NULL) as avg_wait_seconds
            FROM sessions s
            WHERE s.created_at > ?1
            ORDER BY s.created_at DESC`
          )
            .bind(since)
            .all<{
              id: string;
              short_code: string;
              event_name: string | null;
              status: string;
              created_at: string;
              max_guests: number | null;
              location: string | null;
              contact_info: string | null;
              open_time: string | null;
              close_time: string | null;
              total_parties: number;
              served_count: number;
              left_count: number;
              avg_wait_seconds: number | null;
            }>();

          csv =
            'id,short_code,event_name,status,created_at,max_guests,location,contact_info,open_time,close_time,total_parties,served_count,left_count,avg_wait_seconds\n';
          for (const row of result.results || []) {
            csv += `"${row.id}","${row.short_code}","${(row.event_name || '').replace(/"/g, '""')}","${row.status}","${row.created_at}",${row.max_guests ?? ''},"${(row.location || '').replace(/"/g, '""')}","${(row.contact_info || '').replace(/"/g, '""')}","${row.open_time || ''}","${row.close_time || ''}",${row.total_parties},${row.served_count},${row.left_count},${row.avg_wait_seconds ?? ''}\n`;
          }
          filename = `queues_export_${days}d.csv`;
        } else {
          return applyCors(
            jsonError('Invalid export type. Use: parties, events, or queues', 400),
            corsOrigin
          );
        }

        return applyCors(
          new Response(csv, {
            status: 200,
            headers: {
              'content-type': 'text/csv',
              'content-disposition': `attachment; filename="${filename}"`,
            },
          }),
          corsOrigin
        );
      } catch (e) {
        console.error('analytics export error', e);
        return applyCors(new Response('Export failed', { status: 500 }), corsOrigin);
      }
    }

    // Abandonment Risk Model endpoint
    if (request.method === 'GET' && url.pathname === '/api/analytics/abandonment-model') {
      // Require admin authentication
      const { error: adminError } = await requireAdmin(env.DB, request, env.ADMIN_EMAILS);
      if (adminError) {
        return applyCors(adminError, corsOrigin);
      }

      try {
        // Get historical abandonment patterns by wait time bucket
        const abandonmentByWait = await env.DB.prepare(
          `SELECT 
            CASE 
              WHEN wait_ms_at_leave < 180000 THEN '0-3min'
              WHEN wait_ms_at_leave < 300000 THEN '3-5min'
              WHEN wait_ms_at_leave < 600000 THEN '5-10min'
              WHEN wait_ms_at_leave < 900000 THEN '10-15min'
              WHEN wait_ms_at_leave < 1800000 THEN '15-30min'
              ELSE '30min+'
            END as wait_bucket,
            COUNT(*) as left_count,
            AVG(position_at_leave) as avg_position
          FROM parties 
          WHERE status = 'left' 
            AND wait_ms_at_leave IS NOT NULL
            AND joined_at > strftime('%s', 'now') - 30 * 24 * 60 * 60
          GROUP BY wait_bucket`
        ).all<{ wait_bucket: string; left_count: number; avg_position: number | null }>();

        // Get total served for comparison
        const servedByWait = await env.DB.prepare(
          `SELECT 
            CASE 
              WHEN (completed_at - joined_at) * 1000 < 180000 THEN '0-3min'
              WHEN (completed_at - joined_at) * 1000 < 300000 THEN '3-5min'
              WHEN (completed_at - joined_at) * 1000 < 600000 THEN '5-10min'
              WHEN (completed_at - joined_at) * 1000 < 900000 THEN '10-15min'
              WHEN (completed_at - joined_at) * 1000 < 1800000 THEN '15-30min'
              ELSE '30min+'
            END as wait_bucket,
            COUNT(*) as served_count
          FROM parties 
          WHERE status = 'served' 
            AND completed_at IS NOT NULL
            AND joined_at > strftime('%s', 'now') - 30 * 24 * 60 * 60
          GROUP BY wait_bucket`
        ).all<{ wait_bucket: string; served_count: number }>();

        // Calculate abandonment rate per bucket
        const buckets = ['0-3min', '3-5min', '5-10min', '10-15min', '15-30min', '30min+'];
        const abandonmentRates: Record<
          string,
          { left: number; served: number; rate: number; avgPosition: number | null }
        > = {};

        for (const bucket of buckets) {
          const leftData = (abandonmentByWait.results || []).find((r) => r.wait_bucket === bucket);
          const servedData = (servedByWait.results || []).find((r) => r.wait_bucket === bucket);
          const left = leftData?.left_count || 0;
          const served = servedData?.served_count || 0;
          const total = left + served;
          abandonmentRates[bucket] = {
            left,
            served,
            rate: total > 0 ? left / total : 0,
            avgPosition: leftData?.avg_position ?? null,
          };
        }

        return applyCors(
          new Response(
            JSON.stringify({
              buckets: abandonmentRates,
              description:
                'Abandonment rates by wait time bucket. Use to predict risk based on current wait.',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
          corsOrigin
        );
      } catch (e) {
        console.error('abandonment model error', e);
        return applyCors(new Response('Model query failed', { status: 500 }), corsOrigin);
      }
    }

    // Throughput Forecasting endpoint
    if (request.method === 'GET' && url.pathname === '/api/analytics/throughput') {
      // Require admin authentication
      const { error: adminError } = await requireAdmin(env.DB, request, env.ADMIN_EMAILS);
      if (adminError) {
        return applyCors(adminError, corsOrigin);
      }

      try {
        // Hourly patterns - average parties served per hour
        const hourlyPattern = await env.DB.prepare(
          `SELECT 
            CAST(strftime('%H', datetime(joined_at, 'unixepoch')) AS INTEGER) as hour,
            COUNT(*) as total_parties,
            SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as served,
            AVG(CASE WHEN status = 'served' AND completed_at IS NOT NULL 
              THEN (completed_at - joined_at) ELSE NULL END) as avg_wait_seconds
          FROM parties 
          WHERE joined_at > strftime('%s', 'now') - 30 * 24 * 60 * 60
          GROUP BY hour
          ORDER BY hour`
        ).all<{
          hour: number;
          total_parties: number;
          served: number;
          avg_wait_seconds: number | null;
        }>();

        // Daily patterns - weekday analysis (0 = Sunday, 6 = Saturday)
        const dailyPattern = await env.DB.prepare(
          `SELECT 
            CAST(strftime('%w', datetime(joined_at, 'unixepoch')) AS INTEGER) as day_of_week,
            COUNT(*) as total_parties,
            SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as served,
            AVG(CASE WHEN status = 'served' AND completed_at IS NOT NULL 
              THEN (completed_at - joined_at) ELSE NULL END) as avg_wait_seconds
          FROM parties 
          WHERE joined_at > strftime('%s', 'now') - 30 * 24 * 60 * 60
          GROUP BY day_of_week
          ORDER BY day_of_week`
        ).all<{
          day_of_week: number;
          total_parties: number;
          served: number;
          avg_wait_seconds: number | null;
        }>();

        // Queue size vs wait time correlation
        // This estimates wait time at different queue sizes
        const queueSizeWait = await env.DB.prepare(
          `SELECT 
            CASE 
              WHEN position_at_leave <= 3 THEN '1-3'
              WHEN position_at_leave <= 5 THEN '4-5'
              WHEN position_at_leave <= 10 THEN '6-10'
              WHEN position_at_leave <= 20 THEN '11-20'
              ELSE '20+'
            END as position_bucket,
            AVG(wait_ms_at_leave) / 1000 as avg_wait_seconds,
            COUNT(*) as sample_count
          FROM parties 
          WHERE status = 'left' 
            AND position_at_leave IS NOT NULL
            AND wait_ms_at_leave IS NOT NULL
            AND joined_at > strftime('%s', 'now') - 30 * 24 * 60 * 60
          GROUP BY position_bucket
          UNION ALL
          SELECT 
            CASE 
              WHEN (SELECT COUNT(*) FROM parties p2 
                    WHERE p2.session_id = p.session_id 
                    AND p2.joined_at < p.joined_at 
                    AND p2.status IN ('waiting', 'called', 'served')) <= 3 THEN '1-3'
              WHEN (SELECT COUNT(*) FROM parties p2 
                    WHERE p2.session_id = p.session_id 
                    AND p2.joined_at < p.joined_at 
                    AND p2.status IN ('waiting', 'called', 'served')) <= 5 THEN '4-5'
              WHEN (SELECT COUNT(*) FROM parties p2 
                    WHERE p2.session_id = p.session_id 
                    AND p2.joined_at < p.joined_at 
                    AND p2.status IN ('waiting', 'called', 'served')) <= 10 THEN '6-10'
              WHEN (SELECT COUNT(*) FROM parties p2 
                    WHERE p2.session_id = p.session_id 
                    AND p2.joined_at < p.joined_at 
                    AND p2.status IN ('waiting', 'called', 'served')) <= 20 THEN '11-20'
              ELSE '20+'
            END as position_bucket,
            AVG((completed_at - joined_at)) as avg_wait_seconds,
            COUNT(*) as sample_count
          FROM parties p
          WHERE status = 'served'
            AND completed_at IS NOT NULL
            AND joined_at > strftime('%s', 'now') - 30 * 24 * 60 * 60
          GROUP BY position_bucket`
        ).all<{
          position_bucket: string;
          avg_wait_seconds: number | null;
          sample_count: number;
        }>();

        // Service rate (parties served per hour) by queue
        const serviceRate = await env.DB.prepare(
          `SELECT 
            s.id as session_id,
            s.event_name,
            s.short_code,
            COUNT(CASE WHEN p.status = 'served' THEN 1 END) as served_count,
            CASE 
              WHEN MAX(p.completed_at) - MIN(p.joined_at) > 0 
              THEN COUNT(CASE WHEN p.status = 'served' THEN 1 END) * 3600.0 / 
                   (MAX(p.completed_at) - MIN(p.joined_at))
              ELSE NULL 
            END as parties_per_hour
          FROM sessions s
          LEFT JOIN parties p ON s.id = p.session_id
          WHERE s.created_at > strftime('%s', 'now') - 30 * 24 * 60 * 60
          GROUP BY s.id
          HAVING served_count >= 5
          ORDER BY parties_per_hour DESC
          LIMIT 20`
        ).all<{
          session_id: string;
          event_name: string | null;
          short_code: string;
          served_count: number;
          parties_per_hour: number | null;
        }>();

        // Format day names
        const dayNames = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ];
        const formattedDaily = (dailyPattern.results || []).map((d) => ({
          ...d,
          day_name: dayNames[d.day_of_week] || `Day ${d.day_of_week}`,
        }));

        return applyCors(
          new Response(
            JSON.stringify({
              hourlyPattern: hourlyPattern.results || [],
              dailyPattern: formattedDaily,
              queueSizeWaitEstimates: queueSizeWait.results || [],
              topServiceRates: serviceRate.results || [],
              insights: {
                description: 'Throughput patterns based on last 30 days of data',
                usage:
                  'Use hourlyPattern to identify peak hours, dailyPattern for staffing, queueSizeWaitEstimates for capacity planning',
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          ),
          corsOrigin
        );
      } catch (e) {
        console.error('throughput forecast error', e);
        return applyCors(new Response('Throughput query failed', { status: 500 }), corsOrigin);
      }
    }

    // Track events (notif clicks, etc.)
    if (request.method === 'POST' && url.pathname === '/api/track') {
      const payload = (await readJson(request)) ?? {};
      const { sessionId, partyId, type, meta } = payload;
      if (!type) {
        return applyCors(jsonError('type required', 400), corsOrigin);
      }
      try {
        const insertResult = await env.DB.prepare(
          'INSERT INTO events (session_id, party_id, type, details) VALUES (?1, ?2, ?3, ?4)'
        )
          .bind(
            sessionId ?? null,
            partyId ?? null,
            String(type),
            meta ? JSON.stringify(meta) : null
          )
          .run();
        if (insertResult.error) {
          console.warn('track insert warning', insertResult.error);
        }
      } catch (error) {
        console.error('track error', error);
      }
      return applyCors(new Response('ok'), corsOrigin);
    }

    // Manual test push endpoint
    if (request.method === 'POST' && url.pathname === '/api/push/test') {
      try {
        const { sessionId, partyId, title, body, url: targetUrl } = (await readJson(request)) ?? {};
        if (!sessionId || !partyId)
          return applyCors(jsonError('sessionId and partyId required', 400), corsOrigin);
        const sub = await env.DB.prepare(
          'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE session_id=?1 AND party_id=?2 ORDER BY created_at DESC LIMIT 1'
        )
          .bind(sessionId, partyId)
          .first<{ endpoint: string; p256dh: string; auth: string }>();
        if (!sub) return applyCors(new Response('no subscription', { status: 404 }), corsOrigin);
        if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE)
          return applyCors(new Response('vapid not set', { status: 500 }), corsOrigin);
        const sent = await sendPushNotification(env, {
          sessionId,
          partyId,
          subscription: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          title: title || 'QueueUp',
          body: body || 'Hello!',
          url: targetUrl || '/',
          kind: 'test',
          dedupe: false,
        });
        if (!sent) {
          return applyCors(new Response('stale removed', { status: 410 }), corsOrigin);
        }
        return applyCors(new Response('sent'), corsOrigin);
      } catch (e) {
        console.error('push test error', e);
        return applyCors(new Response('fail', { status: 500 }), corsOrigin);
      }
    }

    const match = ROUTE.exec(url.pathname);
    if (!match) {
      return applyCors(new Response('Not found', { status: 404 }), corsOrigin);
    }

    const primary = match[1];
    const action = match[2];
    try {
      if (request.method === 'POST' && primary === 'create') {
        const response = await handleCreate(request, env, url, corsOrigin);
        return applyCors(response, corsOrigin, ['set-cookie']);
      }

      if (primary && action === 'connect' && request.method === 'GET') {
        const response = await handleConnect(request, env, primary);
        if (response.status === 101) {
          return response;
        }
        return applyCors(response, corsOrigin, ['set-cookie']);
      }

      if (primary && action === 'snapshot' && request.method === 'GET') {
        const response = await handleSnapshot(request, env, primary);
        return applyCors(response, corsOrigin, ['etag']);
      }

      if (request.method === 'POST' && primary && action) {
        const response = await handleAction(request, env, primary, action);
        return applyCors(response, corsOrigin);
      }
    } catch (error) {
      console.error('Worker error:', error);
      return applyCors(new Response('Internal Server Error', { status: 500 }), corsOrigin);
    }

    return applyCors(new Response('Not found', { status: 404 }), corsOrigin);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Clean up expired OAuth states, exchange tokens, and sessions
    const { cleanupExpiredAuth } = await import('./utils/oauth');
    await cleanupExpiredAuth(env.DB);
    console.log('[Scheduled] Cleaned up expired auth tokens');
  },

  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        const event = message.body as {
          type: string;
          sessionId: string;
          partyId?: string;
          position?: number;
          queueLength?: number;
          deadline?: number | null;
          reason?: string;
        };

        console.log(
          `[Queue Consumer] Processing event: ${event.type} for session ${event.sessionId}`
        );

        // Handle push notifications
        if (event.partyId) {
          switch (event.type) {
            case 'QUEUE_MEMBER_CALLED':
              {
                const msRemaining =
                  typeof event.deadline === 'number'
                    ? Math.max(event.deadline - Date.now(), 0)
                    : FALLBACK_CALL_WINDOW_MINUTES * MS_PER_MINUTE;
                const minutesRemaining = Math.max(1, Math.ceil(msRemaining / MS_PER_MINUTE));
                const minuteLabel = minutesRemaining === 1 ? 'minute' : 'minutes';
                await sendPushToParty(env, event.sessionId, event.partyId, {
                  title: "It's your turn!",
                  body: `Please confirm within ${minutesRemaining} ${minuteLabel}.`,
                  kind: 'called',
                });
              }
              break;

            case 'QUEUE_POSITION_2':
              {
                const sent = await sendPushToParty(env, event.sessionId, event.partyId, {
                  title: 'Almost there!',
                  body: "You're next in line.",
                  kind: 'pos_2',
                });
                if (sent) {
                  await logAnalyticsEvent({
                    db: env.DB,
                    sessionId: event.sessionId,
                    partyId: event.partyId,
                    type: 'nudge_sent',
                    details: {
                      kind: 'pos_2',
                      position: event.position ?? 2,
                      queueLength: event.queueLength ?? null,
                    },
                  });
                }
              }
              break;

            case 'QUEUE_POSITION_5':
              {
                const sent = await sendPushToParty(env, event.sessionId, event.partyId, {
                  title: 'Getting close!',
                  body: "You're 5th in line.",
                  kind: 'pos_5',
                });
                if (sent) {
                  await logAnalyticsEvent({
                    db: env.DB,
                    sessionId: event.sessionId,
                    partyId: event.partyId,
                    type: 'nudge_sent',
                    details: {
                      kind: 'pos_5',
                      position: event.position ?? 5,
                      queueLength: event.queueLength ?? null,
                    },
                  });
                }
              }
              break;

            case 'QUEUE_MEMBER_JOINED':
              // Already handled in subscribe endpoint
              break;

            case 'QUEUE_MEMBER_SERVED':
            case 'QUEUE_MEMBER_DROPPED':
            case 'QUEUE_MEMBER_LEFT':
            case 'QUEUE_MEMBER_KICKED':
              // No push needed for these
              break;
          }
        }

        // Log event to D1 (optional analytics)
        await logAnalyticsEvent({
          db: env.DB,
          sessionId: event.sessionId,
          partyId: event.partyId ?? null,
          type: 'queue_event',
          details: { eventType: event.type, ...event },
        });

        message.ack();
      } catch (error) {
        console.error('[Queue Consumer] Error processing message:', error);
        message.retry();
      }
    }
  },
};

async function sendPushToParty(
  env: Env,
  sessionId: string,
  partyId: string,
  params: {
    title: string;
    body: string;
    kind?: string;
  }
): Promise<boolean> {
  const sub = await env.DB.prepare(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE session_id=?1 AND party_id=?2 ORDER BY created_at DESC LIMIT 1'
  )
    .bind(sessionId, partyId)
    .first<{ endpoint: string; p256dh: string; auth: string }>();

  if (!sub) {
    console.log(`[sendPushToParty] No subscription found for party ${partyId}`);
    return false;
  }

  return sendPushNotification(env, {
    sessionId,
    partyId,
    subscription: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
    title: params.title,
    body: params.body,
    url: buildAppUrl(env),
    kind: params.kind,
  });
}

async function sendPushNotification(
  env: Env,
  params: {
    sessionId: string;
    partyId: string;
    subscription: { endpoint: string; p256dh: string; auth: string };
    title: string;
    body: string;
    url?: string;
    kind?: string;
    dedupe?: boolean;
  }
): Promise<boolean> {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) {
    return false;
  }

  if (params.kind && params.dedupe !== false) {
    const exists = await env.DB.prepare(
      "SELECT 1 AS x FROM events WHERE session_id=?1 AND party_id=?2 AND type='push_sent' AND json_extract(details, '$.kind') = ?3 LIMIT 1"
    )
      .bind(params.sessionId, params.partyId, params.kind)
      .first<{ x: number }>();
    if (exists?.x) {
      return true;
    }
  }

  try {
    const payload = await buildPushPayload(
      {
        data: JSON.stringify({
          title: params.title,
          body: params.body,
          url: params.url ?? '/',
          kind: params.kind ?? null,
        }),
        options: { ttl: 60 },
      },
      {
        endpoint: params.subscription.endpoint,
        keys: { p256dh: params.subscription.p256dh, auth: params.subscription.auth },
        expirationTime: null,
      },
      {
        subject: env.VAPID_SUBJECT ?? 'mailto:team@queue-up.app',
        publicKey: env.VAPID_PUBLIC,
        privateKey: env.VAPID_PRIVATE,
      }
    );

    const resp = await fetch(params.subscription.endpoint, {
      method: payload.method,
      headers: payload.headers as any,
      body: payload.body as any,
    });

    if (!resp.ok && (resp.status === 404 || resp.status === 410)) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?1')
        .bind(params.subscription.endpoint)
        .run();
      return false;
    }

    if (!resp.ok) {
      console.warn('push delivery failed', resp.status, await resp.text());
      return false;
    }

    if (params.kind) {
      await env.DB.prepare(
        "INSERT INTO events (session_id, party_id, type, details) VALUES (?1, ?2, 'push_sent', ?3)"
      )
        .bind(params.sessionId, params.partyId, JSON.stringify({ kind: params.kind }))
        .run();
    }

    return true;
  } catch (error: any) {
    const status = error?.status ?? error?.code;
    if (status === 404 || status === 410) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?1')
        .bind(params.subscription.endpoint)
        .run()
        .catch(() => {});
    }
    console.warn('sendPushNotification error', error);
    return false;
  }
}

function buildAppUrl(env: Env): string {
  const base =
    env.APP_BASE_URL && env.APP_BASE_URL.trim().length > 0
      ? env.APP_BASE_URL.trim()
      : DEFAULT_APP_BASE_URL;
  try {
    return new URL(base).toString();
  } catch {
    return DEFAULT_APP_BASE_URL;
  }
}

function normalizeTimeString(value: string): string | null {
  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  return match ? `${match[1]}:${match[2]}` : null;
}

function timeStringToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return hours * 60 + minutes;
}

async function handleCreate(
  request: Request,
  env: Env,
  url: URL,
  corsOrigin: string | null
): Promise<Response> {
  // Rate limit: 10 queue creations per minute per IP
  const clientIp = getClientIp(request);
  if (await isRateLimited(env, `queue-create:${clientIp}`, 10)) {
    return jsonError('Too many requests', 429);
  }

  const payload = await readJson(request);
  if (!payload || typeof payload !== 'object') {
    return jsonError('Invalid request body', 400);
  }

  const rawEventName =
    typeof (payload as any).eventName === 'string' ? (payload as any).eventName.trim() : '';
  if (!rawEventName) {
    return jsonError('eventName is required', 400);
  }
  if (rawEventName.length > 120) {
    return jsonError('eventName must be 120 characters or fewer', 400);
  }

  const rawLocation =
    typeof (payload as any).location === 'string' ? (payload as any).location.trim() : '';
  const normalizedLocation =
    rawLocation.length > 0 ? rawLocation.slice(0, MAX_LOCATION_LENGTH) : null;

  const rawContactInfo =
    typeof (payload as any).contactInfo === 'string'
      ? (payload as any).contactInfo.trim()
      : typeof (payload as any).contact === 'string'
        ? (payload as any).contact.trim()
        : '';
  const normalizedContactInfo =
    rawContactInfo.length > 0 ? rawContactInfo.slice(0, MAX_CONTACT_LENGTH) : null;

  const rawOpenTime =
    typeof (payload as any).openTime === 'string' ? (payload as any).openTime.trim() : '';
  const normalizedOpenTime = rawOpenTime.length > 0 ? normalizeTimeString(rawOpenTime) : null;
  if (rawOpenTime.length > 0 && !normalizedOpenTime) {
    return jsonError('openTime must be in HH:mm format', 400);
  }

  const rawCloseTime =
    typeof (payload as any).closeTime === 'string' ? (payload as any).closeTime.trim() : '';
  const normalizedCloseTime = rawCloseTime.length > 0 ? normalizeTimeString(rawCloseTime) : null;
  if (rawCloseTime.length > 0 && !normalizedCloseTime) {
    return jsonError('closeTime must be in HH:mm format', 400);
  }

  if (normalizedOpenTime && normalizedCloseTime) {
    const openMinutes = timeStringToMinutes(normalizedOpenTime);
    const closeMinutes = timeStringToMinutes(normalizedCloseTime);
    if (closeMinutes <= openMinutes) {
      return jsonError('closeTime must be after openTime', 400);
    }
  }

  const rawMaxGuests = (payload as any).maxGuests;
  let maxGuests: number | null = null;
  if (typeof rawMaxGuests === 'number') {
    maxGuests = rawMaxGuests;
  } else if (typeof rawMaxGuests === 'string' && rawMaxGuests.trim().length > 0) {
    const parsed = Number.parseInt(rawMaxGuests, 10);
    if (Number.isFinite(parsed)) {
      maxGuests = parsed;
    }
  }

  if (maxGuests === null || !Number.isInteger(maxGuests)) {
    return jsonError('maxGuests must be an integer', 400);
  }
  if (maxGuests < MIN_QUEUE_CAPACITY || maxGuests > MAX_QUEUE_CAPACITY) {
    return jsonError('maxGuests must be between 1 and 100', 400);
  }

  // Check if requiresAuth is requested
  const rawRequiresAuth = (payload as any).requiresAuth;
  const requiresAuth = rawRequiresAuth === true || rawRequiresAuth === 'true';

  // Check for authenticated user (optional - queue creation works without auth)
  let ownerId: string | null = null;
  const sessionId_auth = getSessionFromRequest(request);
  if (sessionId_auth) {
    const user = await validateSession(env.DB, sessionId_auth);
    if (user) {
      ownerId = user.id;
    }
  }

  // Only authenticated users can create queues that require guest authentication
  if (requiresAuth && !ownerId) {
    return jsonError(
      'You must be logged in to create a queue that requires guest authentication',
      400
    );
  }

  // Turnstile verification
  const turnstileToken = (payload as any).turnstileToken;
  const remoteIp = request.headers.get('CF-Connecting-IP') ?? undefined;
  const clientPlatform = request.headers.get('x-client-platform') ?? 'web';
  const turnstileEnabled =
    env.TURNSTILE_BYPASS !== 'true' &&
    env.TURNSTILE_SECRET_KEY &&
    env.TURNSTILE_SECRET_KEY.trim().length > 0;
  const turnstileRequired = turnstileEnabled && clientPlatform === 'web';

  console.log('[handleCreate] Turnstile check:', {
    enabled: turnstileEnabled,
    required: turnstileRequired,
    bypass: env.TURNSTILE_BYPASS,
    hasSecret: !!env.TURNSTILE_SECRET_KEY,
    hasToken: !!turnstileToken,
    clientPlatform,
    tokenPreview: turnstileToken?.substring(0, 20),
  });

  if (turnstileRequired) {
    if (
      !turnstileToken ||
      typeof turnstileToken !== 'string' ||
      turnstileToken.trim().length === 0
    ) {
      console.warn('[handleCreate] Turnstile token missing!');
      return jsonError('Turnstile verification required', 400, {
        errors: ['missing-input-response'],
      });
    }

    const verification = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, turnstileToken, remoteIp);
    console.log('[handleCreate] Turnstile verification result:', verification);
    if (!verification.success) {
      return jsonError('Turnstile verification failed', 400, {
        errors: verification['error-codes'] ?? [],
      });
    }
  }

  const eventName = rawEventName;
  const id = env.QUEUE_DO.newUniqueId();
  const sessionId = id.toString();

  const shortCode = await generateUniqueCode(env);

  const insertResult = await env.DB.prepare(
    "INSERT INTO sessions (id, short_code, status, event_name, max_guests, location, contact_info, open_time, close_time, owner_id, requires_auth) VALUES (?1, ?2, 'active', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
  )
    .bind(
      sessionId,
      shortCode,
      eventName,
      maxGuests,
      normalizedLocation,
      normalizedContactInfo,
      normalizedOpenTime,
      normalizedCloseTime,
      ownerId,
      requiresAuth ? 1 : 0
    )
    .run();

  if (insertResult.error) {
    console.error('Failed to insert session:', insertResult.error);
    return new Response('Failed to create session', { status: 500 });
  }

  await env.QUEUE_KV.put(shortCode, sessionId, { expirationTtl: HOST_COOKIE_MAX_AGE_SECONDS });

  const origin = url.origin;
  const joinUrl = new URL(`/queue/${shortCode}`, origin).toString();
  const wsUrl = new URL(`/api/queue/${shortCode}/connect`, origin).toString();

  const hostCookieValue = await generateHostCookieValue(sessionId, env.HOST_AUTH_SECRET);
  const headers = new Headers({
    'content-type': 'application/json',
  });
  headers.append(
    'set-cookie',
    buildSetCookie(hostCookieValue, HOST_COOKIE_MAX_AGE_SECONDS, corsOrigin ?? origin)
  );

  const body = JSON.stringify({
    code: shortCode,
    sessionId,
    joinUrl,
    wsUrl,
    hostAuthToken: hostCookieValue,
    eventName,
    maxGuests,
    location: normalizedLocation,
    contactInfo: normalizedContactInfo,
    openTime: normalizedOpenTime,
    closeTime: normalizedCloseTime,
    requiresAuth,
    ownerId,
  });

  return new Response(body, { status: 200, headers });
}

async function handleConnect(request: Request, env: Env, code: string): Promise<Response> {
  const normalizedCode = code.toUpperCase();
  const sessionId = await resolveSessionId(env, normalizedCode);
  if (!sessionId) {
    return new Response('Session not found', { status: 404 });
  }

  const id = env.QUEUE_DO.idFromString(sessionId);
  const stub = env.QUEUE_DO.get(id);

  const headers = new Headers(request.headers);
  headers.set('x-session-id', sessionId);
  if (headers.has('x-host-auth')) {
    console.log('[worker.handleConnect]', 'forwarding host auth header for session', sessionId);
  }

  const doUrl = new URL(request.url);
  doUrl.pathname = '/connect';

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  const webSocket = (request as any).webSocket;
  if (webSocket) {
    (init as any).webSocket = webSocket;
  }
  if (request.body !== null && request.body !== undefined) {
    init.body = request.body as ReadableStream | null;
  }

  const forwardedRequest = new Request(doUrl.toString(), init);

  return stub.fetch(forwardedRequest);
}

async function handleSnapshot(request: Request, env: Env, code: string): Promise<Response> {
  const normalizedCode = code.toUpperCase();
  const sessionId = await resolveSessionId(env, normalizedCode);
  if (!sessionId) {
    return new Response('Session not found', { status: 404 });
  }

  const id = env.QUEUE_DO.idFromString(sessionId);
  const stub = env.QUEUE_DO.get(id);

  const headers = new Headers(request.headers);
  headers.set('x-session-id', sessionId);

  const doUrl = new URL(request.url);
  doUrl.pathname = '/snapshot';

  const forwardedRequest = new Request(doUrl.toString(), {
    method: 'GET',
    headers,
  });

  return stub.fetch(forwardedRequest);
}

async function handleAction(
  request: Request,
  env: Env,
  code: string,
  action: string
): Promise<Response> {
  const normalizedCode = code.toUpperCase();
  const sessionId = await resolveSessionId(env, normalizedCode);
  if (!sessionId) {
    return new Response('Session not found', { status: 404 });
  }

  switch (action) {
    case 'join':
      return handleJoin(request, env, sessionId);
    case 'declare-nearby':
    case 'leave':
      return handleGuestAction(request, env, sessionId, action);
    case 'advance':
    case 'kick':
    case 'close':
      return handleHostAction(request, env, sessionId, action);
    default:
      return new Response('Not found', { status: 404 });
  }
}

async function handleJoin(request: Request, env: Env, sessionId: string): Promise<Response> {
  // Rate limit: 20 queue joins per minute per IP
  const clientIp = getClientIp(request);
  if (await isRateLimited(env, `queue-join:${clientIp}`, 20)) {
    return jsonError('Too many requests', 429);
  }

  const payload = await readJson(request);
  if (!payload) {
    return jsonError('Invalid JSON body', 400);
  }

  const { name, size, turnstileToken } = payload;
  if (name !== undefined && typeof name !== 'string') {
    return jsonError('name must be a string', 400);
  }
  if (size !== undefined && (!Number.isInteger(size) || size <= 0)) {
    return jsonError('size must be a positive integer', 400);
  }

  // Check if this queue requires authentication
  const sessionRow = await env.DB.prepare('SELECT requires_auth FROM sessions WHERE id = ?1')
    .bind(sessionId)
    .first<{ requires_auth: number | null }>();

  const requiresAuth = sessionRow?.requires_auth === 1;

  // Check for authenticated user
  let userId: string | null = null;
  const authSessionId = getSessionFromRequest(request);
  if (authSessionId) {
    const user = await validateSession(env.DB, authSessionId);
    if (user) {
      userId = user.id;
    }
  }

  // If queue requires auth, ensure user is logged in
  if (requiresAuth && !userId) {
    return jsonError('This queue requires you to log in before joining', 401, {
      requiresAuth: true,
    });
  }

  // If user is authenticated, check for duplicate joins (one user = one spot in queue)
  if (userId) {
    const existingParty = await env.DB.prepare(
      "SELECT id FROM parties WHERE session_id = ?1 AND user_id = ?2 AND status IN ('waiting', 'called') LIMIT 1"
    )
      .bind(sessionId, userId)
      .first<{ id: string }>();

    if (existingParty) {
      return jsonError('You are already in this queue', 409, {
        existingPartyId: existingParty.id,
      });
    }
  }

  const remoteIp = request.headers.get('CF-Connecting-IP') ?? undefined;
  const clientPlatform = request.headers.get('x-client-platform') ?? 'web';
  const turnstileEnabled =
    env.TURNSTILE_BYPASS !== 'true' &&
    env.TURNSTILE_SECRET_KEY &&
    env.TURNSTILE_SECRET_KEY.trim().length > 0;
  const turnstileRequired = turnstileEnabled && clientPlatform === 'web';

  console.log('[handleJoin] Turnstile check:', {
    enabled: turnstileEnabled,
    required: turnstileRequired,
    bypass: env.TURNSTILE_BYPASS,
    hasSecret: !!env.TURNSTILE_SECRET_KEY,
    hasToken: !!turnstileToken,
    clientPlatform,
    tokenPreview: turnstileToken?.substring(0, 20),
  });

  // If Turnstile is enabled, require a valid token
  if (turnstileRequired) {
    if (
      !turnstileToken ||
      typeof turnstileToken !== 'string' ||
      turnstileToken.trim().length === 0
    ) {
      console.warn('[handleJoin] Turnstile token missing!');
      return jsonError('Turnstile verification required', 400, {
        errors: ['missing-input-response'],
      });
    }

    const verification = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, turnstileToken, remoteIp);
    console.log('[handleJoin] Turnstile verification result:', verification);
    if (!verification.success) {
      return jsonError('Turnstile verification failed', 400, {
        errors: verification['error-codes'] ?? [],
      });
    }
  }

  const body = {
    name,
    size,
    userId, // Pass user_id to QueueDO if authenticated
  };
  return proxyJsonToQueueDO(env, sessionId, 'join', body, request.headers);
}

async function handleGuestAction(
  request: Request,
  env: Env,
  sessionId: string,
  action: 'declare-nearby' | 'leave'
): Promise<Response> {
  const payload = await readJson(request);
  if (!payload) {
    return jsonError('Invalid JSON body', 400);
  }

  const { partyId } = payload;
  if (typeof partyId !== 'string' || !partyId) {
    return jsonError('partyId is required', 400);
  }

  return proxyJsonToQueueDO(env, sessionId, action, { partyId }, request.headers);
}

async function handleHostAction(
  request: Request,
  env: Env,
  sessionId: string,
  action: 'advance' | 'kick' | 'close'
): Promise<Response> {
  const hostCookie = await requireHostAuth(request, sessionId, env);
  if (hostCookie instanceof Response) {
    return hostCookie;
  }

  let payload: any = {};
  if (action !== 'close') {
    const data = await readJson(request);
    payload = typeof data === 'object' && data !== null ? data : {};
  }

  let body: Record<string, unknown> = {};
  switch (action) {
    case 'advance': {
      const { servedParty, nextParty } = payload as {
        servedParty?: string;
        nextParty?: string;
      };
      if (servedParty !== undefined && typeof servedParty !== 'string') {
        return jsonError('servedParty must be a string', 400);
      }
      if (nextParty !== undefined && typeof nextParty !== 'string') {
        return jsonError('nextParty must be a string', 400);
      }
      body = { servedParty, nextParty };
      break;
    }
    case 'kick': {
      const { partyId } = payload as { partyId?: string };
      if (typeof partyId !== 'string' || !partyId) {
        return jsonError('partyId is required', 400);
      }
      body = { partyId };
      break;
    }
    case 'close': {
      body = {};
      break;
    }
  }

  return proxyJsonToQueueDO(env, sessionId, action, body, request.headers, hostCookie);
}

async function proxyJsonToQueueDO(
  env: Env,
  sessionId: string,
  action: string,
  body: Record<string, unknown>,
  originalHeaders: Headers,
  hostCookieValue?: string
): Promise<Response> {
  const id = env.QUEUE_DO.idFromString(sessionId);
  const stub = env.QUEUE_DO.get(id);

  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('x-session-id', sessionId);

  const ip = originalHeaders.get('CF-Connecting-IP');
  if (ip) {
    headers.set('cf-connecting-ip', ip);
  }

  if (hostCookieValue) {
    headers.set('x-host-auth', hostCookieValue);
  }

  const requestBody = JSON.stringify(body);
  const doRequest = new Request(`https://queue-do/${action}`, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  return stub.fetch(doRequest);
}

async function generateUniqueCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomCode(SHORT_CODE_LENGTH);
    const existing = await env.QUEUE_KV.get(code);
    if (!existing) {
      return code;
    }
  }
  throw new Error('Unable to generate unique short code');
}

function randomCode(length: number): string {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  let result = '';
  for (let i = 0; i < buffer.length; i += 1) {
    const index = buffer[i] % SHORT_CODE_ALPHABET.length;
    result += SHORT_CODE_ALPHABET[index];
  }
  return result;
}

async function resolveSessionId(env: Env, code: string): Promise<string | undefined> {
  const normalizedCode = code.toUpperCase();
  let sessionId = await env.QUEUE_KV.get(normalizedCode);
  if (sessionId) {
    return sessionId;
  }

  const row = await env.DB.prepare('SELECT id FROM sessions WHERE short_code = ?1 LIMIT 1')
    .bind(normalizedCode)
    .first<{ id: string }>();

  if (row?.id) {
    sessionId = row.id;
    await env.QUEUE_KV.put(normalizedCode, sessionId, {
      expirationTtl: HOST_COOKIE_MAX_AGE_SECONDS,
    });
    return sessionId;
  }

  return undefined;
}

async function readJson(request: Request): Promise<any | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>): Response {
  const payload = JSON.stringify({ error: message, ...extra });
  return new Response(payload, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function applyCors(
  response: Response,
  origin: string | null,
  exposeHeaders?: string[],
  isPreflight?: boolean
): Response {
  const headers = new Headers(response.headers);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Credentials', 'true');
  if (exposeHeaders && exposeHeaders.length > 0) {
    headers.set('Access-Control-Expose-Headers', exposeHeaders.join(', '));
  }
  if (isPreflight) {
    headers.set(
      'Access-Control-Allow-Headers',
      'content-type, cf-connecting-ip, authorization, x-host-auth, if-none-match'
    );
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Max-Age', '600');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveAllowedOrigin(request: Request, url: URL, env: Env): string | null | Response {
  const origin = request.headers.get('Origin');
  if (!origin) {
    return url.origin;
  }

  if (origin === url.origin) {
    return origin;
  }

  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowed.includes(origin)) {
    return origin;
  }

  return new Response('Origin not allowed', { status: 403 });
}

async function verifyTurnstile(
  secret: string,
  token: string,
  remoteip?: string
): Promise<TurnstileVerifyResponse> {
  const form = new URLSearchParams();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteip) {
    form.append('remoteip', remoteip);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    console.error('Turnstile verify failed with status', response.status);
    return { success: false, 'error-codes': ['request_failed'] };
  }

  const data = (await response.json()) as TurnstileVerifyResponse;
  return data;
}

async function requireHostAuth(
  request: Request,
  sessionId: string,
  env: Env
): Promise<string | Response> {
  const headerToken = request.headers.get('x-host-auth');
  if (headerToken) {
    const headerValid = await verifyHostCookie(headerToken, sessionId, env.HOST_AUTH_SECRET);
    if (headerValid) {
      return headerToken;
    }
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const cookieValue = cookies.get(HOST_COOKIE_NAME);
  if (!cookieValue) {
    if (headerToken) {
      return jsonError('Invalid host authentication', 403);
    }
    return jsonError('Host authentication required', 401);
  }

  const valid = await verifyHostCookie(cookieValue, sessionId, env.HOST_AUTH_SECRET);
  if (!valid) {
    return jsonError('Invalid host authentication', 403);
  }

  return cookieValue;
}

function parseCookies(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) {
    return map;
  }
  const pairs = header.split(';');
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    map.set(name, value);
  }
  return map;
}

function buildSetCookie(value: string, maxAge: number, origin: string): string {
  const url = new URL(origin);
  const attributes = [
    `${HOST_COOKIE_NAME}=${value}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
  ];
  const domain = url.hostname;
  if (!isIpAddress(domain) && domain.includes('.')) {
    attributes.push(`Domain=${domain}`);
  }
  return attributes.join('; ');
}

function isIpAddress(hostname: string): boolean {
  return /^[\d.]+$/.test(hostname) || /^[0-9a-f:]+$/i.test(hostname);
}

interface TurnstileVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
}

/**
 * Simple KV-based rate limiter for auth endpoints.
 * Uses a sliding window approach with 1-minute buckets.
 *
 * @param env - Worker environment
 * @param key - Unique identifier (e.g., IP address or endpoint + IP)
 * @param limit - Maximum requests allowed per window
 * @param windowSeconds - Time window in seconds (default 60)
 * @param failClosed - If true, failures in KV will block the request (fail-closed)
 * @returns true if rate limited, false otherwise (or on failure when failClosed is true)
 */
async function isRateLimited(
  env: Env,
  key: string,
  limit: number,
  windowSeconds = 60,
  failClosed = false
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSeconds);
  const kvKey = `ratelimit:${key}:${bucket}`;

  try {
    const current = await env.QUEUE_KV.get(kvKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
      return true;
    }

    // Increment counter with TTL equal to window
    await env.QUEUE_KV.put(kvKey, String(count + 1), {
      expirationTtl: windowSeconds * 2, // 2x window to handle edge cases
    });

    return false;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Optionally fail closed for sensitive endpoints
    return failClosed;
  }
}

/**
 * Get client IP address from request headers.
 * Cloudflare sets CF-Connecting-IP for the real client IP.
 */
function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}
