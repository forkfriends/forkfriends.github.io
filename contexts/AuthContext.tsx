import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../lib/backend';

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

  // Handle deep link callbacks (for native apps)
  const handleDeepLink = useCallback(async (url: string) => {
    try {
      const parsed = new URL(url);
      const token = parsed.searchParams.get('exchange_token');
      const returnTo = parsed.searchParams.get('return_to');

      if (token) {
        const result = await exchangeToken(token);
        if (result) {
          await setStoredSessionToken(result.session_token);
          setSessionToken(result.session_token);
          setState({
            user: result.user,
            isLoading: false,
            isAuthenticated: true,
            isAdmin: result.user.is_admin === true,
          });

          // TODO: Handle native navigation to returnTo
          // This would require a navigation ref to be passed in or exposed
          // For now, native apps will return to the default screen
          if (returnTo) {
            console.log('Native auth complete, should navigate to:', returnTo);
          }
        }
      }
    } catch (error) {
      console.error('Error handling deep link:', error);
    }
  }, []);

  // Handle web URL params on load
  const handleWebAuthCallback = useCallback(async () => {
    if (Platform.OS !== 'web') return;

    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');
    const exchangeTokenParam = params.get('exchange_token');
    const returnTo = params.get('return_to');

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
    } else if (authStatus === 'error') {
      const errorMsg = params.get('error') || 'Authentication failed';
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
        // Check for web auth callback first
        if (Platform.OS === 'web') {
          const params = new URLSearchParams(window.location.search);
          if (params.get('auth')) {
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
      if (!returnTo && Platform.OS === 'web') {
        // Default: return to current path (preserving the user's location)
        returnTo = window.location.pathname + window.location.search;
      }

      if (returnTo) {
        authUrl.searchParams.set('return_to', returnTo);
      }

      if (isNative) {
        // For native apps, set the deep link redirect URI
        authUrl.searchParams.set('redirect_uri', 'queueup://auth/callback');
        // Open in system browser
        await Linking.openURL(authUrl.toString());
      } else {
        // For web, pass the current origin so we redirect back here after auth
        // This allows localhost dev and production to both work
        const currentOrigin = window.location.origin;
        authUrl.searchParams.set('redirect_uri', currentOrigin);
        window.location.href = authUrl.toString();
      }
    },
    []
  );

  // Logout function
  const logout = useCallback(async () => {
    await logoutFromServer(sessionToken);
    await clearStoredSessionToken();
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
