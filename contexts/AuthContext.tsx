import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Platform, Linking } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/backend';
import { storage, setAuthExpiredCallback } from '../utils/storage';

// Ensure auth-session can resolve in-app browser flow
WebBrowser.maybeCompleteAuthSession();

// Constants
const AUTH_SESSION_KEY = 'queueup-auth-session';

// Types
export interface User {
  id: string;
  github_username: string | null;
  github_avatar_url: string | null;
  google_name: string | null;
  google_email: string | null;
  google_avatar_url: string | null;
  email: string | null;
  is_admin?: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

interface LoginOptions {
  returnTo?: string;
}

interface AuthContextType extends AuthState {
  login: (provider?: 'github' | 'google', options?: LoginOptions) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | null>(null);

// Storage helpers
// For native apps: use AsyncStorage
// For web in cross-origin mode (localhost): use localStorage
// For web same-origin: use HttpOnly cookies (no storage needed)
async function getStoredSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    // Check localStorage for cross-origin token
    try {
      return localStorage.getItem(AUTH_SESSION_KEY);
    } catch {
      return null;
    }
  }
  try {
    return await AsyncStorage.getItem(AUTH_SESSION_KEY);
  } catch {
    return null;
  }
}

async function setStoredSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Store in localStorage for cross-origin scenarios
    try {
      localStorage.setItem(AUTH_SESSION_KEY, token);
    } catch {
      // localStorage might be unavailable
    }
    return;
  }
  await AsyncStorage.setItem(AUTH_SESSION_KEY, token);
}

async function clearStoredSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
    } catch {
      // localStorage might be unavailable
    }
    return;
  }
  await AsyncStorage.removeItem(AUTH_SESSION_KEY);
}

// API helpers
async function fetchCurrentUser(sessionToken?: string | null): Promise<User | null> {
  try {
    const headers: HeadersInit = {
      'content-type': 'application/json',
    };

    // For native apps, include the bearer token
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include', // For web cookies
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.user || null;
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

async function exchangeToken(
  exchangeToken: string
): Promise<{ session_token: string; user: User } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/exchange`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ exchange_token: exchangeToken }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error exchanging token:', error);
    return null;
  }
}

async function logoutFromServer(sessionToken?: string | null): Promise<void> {
  try {
    const headers: HeadersInit = {
      'content-type': 'application/json',
    };

    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });
  } catch (error) {
    console.error('Error logging out:', error);
  }
}

// Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
  });
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const completeLoginWithExchangeToken = useCallback(
    async (exchangeTokenValue: string, returnTo?: string) => {
      const result = await exchangeToken(exchangeTokenValue);
      if (!result) {
        throw new Error('Failed to exchange token');
      }

      await setStoredSessionToken(result.session_token);
      setSessionToken(result.session_token);
      setState({
        user: result.user,
        isLoading: false,
        isAuthenticated: true,
        isAdmin: result.user.is_admin === true,
      });

      // Migrate local queues to server
      try {
        const migrationResult = await storage.migrateQueuesToServer();
        if (migrationResult.claimedOwned > 0 || migrationResult.claimedJoined > 0) {
          console.log(
            `Migrated queues to server: ${migrationResult.claimedOwned} owned, ${migrationResult.claimedJoined} joined`
          );
        }
      } catch (migrationError) {
        console.warn('Queue migration failed:', migrationError);
      }

      if (returnTo) {
        console.log('Auth complete, returnTo:', returnTo);
      }
    },
    []
  );

  // Handle session expiry from storage layer
  const handleAuthExpired = useCallback(() => {
    console.log('Session expired, clearing auth state');
    clearStoredSessionToken();
    void storage.clearQueuesCache();
    setSessionToken(null);
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
    });
  }, []);

  // Register the auth expired callback with storage
  useEffect(() => {
    setAuthExpiredCallback(handleAuthExpired);
    return () => {
      setAuthExpiredCallback(null);
    };
  }, [handleAuthExpired]);

  // Handle deep link callbacks (for native apps)
  const handleDeepLink = useCallback(
    async (url: string) => {
      try {
        const parsed = new URL(url);
        // Check fragment first (security improvement - tokens now in fragment)
        // then fall back to query params for backwards compatibility
        const fragmentParams = new URLSearchParams(parsed.hash.slice(1));
        const token =
          fragmentParams.get('exchange_token') || parsed.searchParams.get('exchange_token');
        const returnTo = fragmentParams.get('return_to') || parsed.searchParams.get('return_to');

        if (token) {
          await completeLoginWithExchangeToken(token, returnTo || undefined);
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    },
    [completeLoginWithExchangeToken]
  );

  // Handle web URL params on load
  const handleWebAuthCallback = useCallback(async () => {
    if (Platform.OS !== 'web') return;

    // Check for fragment params first (cross-origin flow uses fragments for security)
    // Fragments are not sent to the server via Referer header
    const fragmentParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);

    // Prefer fragment params, fall back to query params for same-origin cookie flow
    const authStatus = fragmentParams.get('auth') || queryParams.get('auth');
    const exchangeTokenParam = fragmentParams.get('exchange_token'); // Only in fragment
    const returnTo = fragmentParams.get('return_to') || queryParams.get('return_to');

    if (authStatus === 'success') {
      // Determine where to navigate after auth
      // returnTo is the in-app path (e.g., '/admin', '/join/ABC123')
      const targetPath = returnTo || '/';

      // Clear the URL params and navigate to returnTo
      window.history.replaceState({}, '', targetPath);

      // Check if we have an exchange token (cross-origin flow like localhost)
      if (exchangeTokenParam) {
        const result = await exchangeToken(exchangeTokenParam);
        if (result) {
          // Store token for future API calls (even on web for cross-origin)
          await setStoredSessionToken(result.session_token);
          setSessionToken(result.session_token);
          setState({
            user: result.user,
            isLoading: false,
            isAuthenticated: true,
            isAdmin: result.user.is_admin === true,
          });

          // Migrate localStorage queues to server after successful login
          try {
            const migrationResult = await storage.migrateQueuesToServer();
            if (migrationResult.claimedOwned > 0 || migrationResult.claimedJoined > 0) {
              console.log(
                `Migrated queues to server: ${migrationResult.claimedOwned} owned, ${migrationResult.claimedJoined} joined`
              );
            }
          } catch (migrationError) {
            console.warn('Queue migration failed:', migrationError);
          }

          return;
        } else {
          console.error('Failed to exchange token');
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
          });
          return;
        }
      }

      // No exchange token - try fetching user via cookie (same-origin flow)
      const user = await fetchCurrentUser();
      setState({
        user,
        isLoading: false,
        isAuthenticated: !!user,
        isAdmin: user?.is_admin === true,
      });

      // Migrate localStorage queues to server after successful login (same-origin flow)
      if (user) {
        try {
          const migrationResult = await storage.migrateQueuesToServer();
          if (migrationResult.claimedOwned > 0 || migrationResult.claimedJoined > 0) {
            console.log(
              `Migrated queues to server: ${migrationResult.claimedOwned} owned, ${migrationResult.claimedJoined} joined`
            );
          }
        } catch (migrationError) {
          console.warn('Queue migration failed:', migrationError);
        }
      }
    } else if (authStatus === 'error') {
      const errorMsg =
        fragmentParams.get('error') || queryParams.get('error') || 'Authentication failed';
      console.error('Auth error:', errorMsg);

      // Clear the URL params, navigate back to returnTo or home
      const targetPath = returnTo || '/';
      window.history.replaceState({}, '', targetPath);

      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        isAdmin: false,
      });
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    async function initAuth() {
      try {
        // Check for web auth callback first (fragment or query params)
        if (Platform.OS === 'web') {
          const fragmentParams = new URLSearchParams(window.location.hash.slice(1));
          const queryParams = new URLSearchParams(window.location.search);
          if (fragmentParams.get('auth') || queryParams.get('auth')) {
            await handleWebAuthCallback();
            return;
          }
        }

        // For native, check for stored token
        const storedToken = await getStoredSessionToken();
        if (storedToken) {
          setSessionToken(storedToken);
        }

        // Fetch current user
        const user = await fetchCurrentUser(storedToken);
        setState({
          user,
          isLoading: false,
          isAuthenticated: !!user,
          isAdmin: user?.is_admin === true,
        });
      } catch (error) {
        console.error('Error initializing auth:', error);
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isAdmin: false,
        });
      }
    }

    initAuth();
  }, [handleWebAuthCallback]);

  // Set up deep link listener for native apps
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Handle initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Handle deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  // Login function
  const login = useCallback(
    async (provider: 'github' | 'google' = 'github', options?: LoginOptions) => {
      const isNative = Platform.OS !== 'web';
      const platform = isNative ? 'native' : 'web';

      // Build the auth URL based on provider
      const authUrl = new URL(`${API_BASE_URL}/api/auth/${provider}`);
      authUrl.searchParams.set('platform', platform);

      // Determine returnTo path
      let returnTo = options?.returnTo;
      if (!returnTo && Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
        // Default: return to current path (preserving the user's location)
        returnTo = window.location.pathname + window.location.search;
      }

      if (returnTo) {
        authUrl.searchParams.set('return_to', returnTo);
      }

      if (isNative) {
        // Native apps: use custom scheme callback (works in dev client / standalone and in Expo Go)
        const redirectUri = AuthSession.makeRedirectUri({
          scheme: 'queueup',
          path: 'auth/callback',
        });
        authUrl.searchParams.set('redirect_uri', redirectUri);

        const authUrlString = authUrl.toString();
        console.log('[Auth] start native auth', { provider, authUrl: authUrlString, redirectUri });

        // Use WebBrowser.openAuthSessionAsync instead of deprecated AuthSession.startAsync
        // This properly handles the redirect back to the app on iOS/Android
        const result = await WebBrowser.openAuthSessionAsync(authUrlString, redirectUri);

        console.log('[Auth] auth session result', { type: result.type, result });

        if (result.type === 'success' && result.url) {
          // Parse the exchange token from the redirect URL
          // The backend puts it in the URL fragment for security (prevents Referer leakage)
          const url = new URL(result.url);
          const fragmentParams = new URLSearchParams(url.hash.slice(1));
          const exchangeTokenParam =
            fragmentParams.get('exchange_token') || url.searchParams.get('exchange_token');

          console.log('[Auth] parsed redirect', {
            url: result.url,
            exchangeTokenParam: !!exchangeTokenParam,
          });

          if (exchangeTokenParam) {
            await completeLoginWithExchangeToken(exchangeTokenParam, returnTo || undefined);
          } else {
            console.warn('Auth success but no exchange_token in redirect URL');
          }
        } else if (result.type === 'dismiss' || result.type === 'cancel') {
          console.log('Auth cancelled by user');
        } else {
          console.log('Auth did not complete', result.type);
        }
      } else {
        // For web, pass the current origin so we redirect back here after auth
        // This allows localhost dev and production to both work
        if (typeof window === 'undefined' || !window.location?.origin) {
          console.error('Cannot start web auth: window.location.origin not available');
          return;
        }
        const currentOrigin = window.location.origin;
        authUrl.searchParams.set('redirect_uri', currentOrigin);
        window.location.href = authUrl.toString();
      }
    },
    [completeLoginWithExchangeToken]
  );

  // Logout function
  const logout = useCallback(async () => {
    await logoutFromServer(sessionToken);
    await clearStoredSessionToken();
    await storage.clearQueuesCache();
    setSessionToken(null);
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
    });
  }, [sessionToken]);

  // Refresh user function
  const refreshUser = useCallback(async () => {
    const user = await fetchCurrentUser(sessionToken);
    setState((prev) => ({
      ...prev,
      user,
      isAuthenticated: !!user,
      isAdmin: user?.is_admin === true,
    }));
  }, [sessionToken]);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper hook for requiring authentication
export function useRequireAuth(): AuthContextType & { isReady: boolean } {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      // Could auto-redirect to login or show a message
      console.log('User is not authenticated');
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  return {
    ...auth,
    isReady: !auth.isLoading,
  };
}
