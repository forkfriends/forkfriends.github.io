import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  getMyQueues,
  getMyMemberships,
  claimQueues,
  MyQueue,
  QueueMembership,
} from '../lib/backend';

const ACTIVE_QUEUES_KEY = 'queueup-active-queues';
const JOINED_QUEUES_KEY = 'queueup-joined-queues';
const HOST_AUTH_PREFIX = 'queueup-host-auth:';
const HOST_AUTH_CODE_PREFIX = 'queueup-host-auth-code:';
const TRUST_SURVEY_PREFIX = 'queueup-trust-survey:';
const QUEUES_LAST_SYNC_KEY = 'queueup-queues-last-sync';
const MEMBERSHIPS_LAST_SYNC_KEY = 'queueup-memberships-last-sync';
const SYNC_KEYS = [QUEUES_LAST_SYNC_KEY, MEMBERSHIPS_LAST_SYNC_KEY];

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

// Callback for handling auth expiry (set by AuthContext)
let onAuthExpired: (() => void) | null = null;

/**
 * Set a callback to be called when authentication expires
 * This allows the storage layer to notify AuthContext of session expiry
 */
export function setAuthExpiredCallback(callback: (() => void) | null): void {
  onAuthExpired = callback;
}

/**
 * Check if an error indicates authentication has expired
 */
function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('authentication required') ||
      msg.includes('invalid session') ||
      msg.includes('unauthorized') ||
      msg.includes('401')
    );
  }
  return false;
}

// Helper to check if cache is stale
function isCacheStale(lastSyncKey: string): boolean {
  if (Platform.OS === 'web') {
    try {
      const lastSync = window.localStorage.getItem(lastSyncKey);
      if (!lastSync) return true;
      return Date.now() - parseInt(lastSync, 10) > CACHE_TTL_MS;
    } catch {
      return true;
    }
  }
  return true; // For native, always consider stale (we don't cache sync times)
}

function updateSyncTime(lastSyncKey: string): void {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(lastSyncKey, Date.now().toString());
    } catch {
      // Ignore
    }
  }
}

export type StoredQueue = {
  code: string;
  sessionId: string;
  wsUrl: string;
  hostAuthToken: string;
  joinUrl?: string;
  eventName?: string;
  maxGuests?: number;
  location?: string | null;
  contactInfo?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
  createdAt: number; // timestamp for sorting
};

export type StoredJoinedQueue = {
  code: string;
  sessionId: string;
  partyId: string;
  eventName?: string;
  joinedAt: number;
};

export type TrustSurveyResponse = {
  answer: 'yes' | 'no';
  submittedAt: number;
};

export const storage = {
  async clearQueuesCache(): Promise<void> {
    const keysToClear = [ACTIVE_QUEUES_KEY, JOINED_QUEUES_KEY, ...SYNC_KEYS];

    if (Platform.OS === 'web') {
      try {
        keysToClear.forEach((key) => window.localStorage.removeItem(key));
      } catch {
        // Fall back to AsyncStorage on web if localStorage fails
      }
    }

    try {
      await AsyncStorage.multiRemove(keysToClear);
    } catch (error) {
      console.warn('Failed to clear queue caches:', error);
    }
  },

  // ============================================
  // Active Queues (Host-owned queues)
  // ============================================

  async setActiveQueue(queue: StoredQueue): Promise<void> {
    const queues = await this.getActiveQueuesLocal();
    const updatedQueues = [
      ...queues.filter((q) => q.code !== queue.code),
      { ...queue, createdAt: Date.now() },
    ];
    const value = JSON.stringify(updatedQueues);

    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(ACTIVE_QUEUES_KEY, value);
      } catch {
        // Fallback to AsyncStorage on web if localStorage fails
        await AsyncStorage.setItem(ACTIVE_QUEUES_KEY, value);
      }
    } else {
      await AsyncStorage.setItem(ACTIVE_QUEUES_KEY, value);
    }
  },

  /**
   * Get active queues from localStorage only (for offline/guest mode)
   */
  async getActiveQueuesLocal(): Promise<StoredQueue[]> {
    let value: string | null = null;

    if (Platform.OS === 'web') {
      try {
        value = window.localStorage.getItem(ACTIVE_QUEUES_KEY);
      } catch {
        // Fallback to AsyncStorage on web if localStorage fails
        value = await AsyncStorage.getItem(ACTIVE_QUEUES_KEY);
      }
    } else {
      value = await AsyncStorage.getItem(ACTIVE_QUEUES_KEY);
    }

    return value ? JSON.parse(value) : [];
  },

  /**
   * Get active queues - server-first for logged in users, localStorage for guests
   * @param isAuthenticated - Whether the user is logged in
   * @param forceRefresh - Force server fetch even if cache is fresh
   */
  async getActiveQueues(
    isAuthenticated: boolean = false,
    forceRefresh: boolean = false
  ): Promise<StoredQueue[]> {
    // For unauthenticated users, use localStorage only
    if (!isAuthenticated) {
      return this.getActiveQueuesLocal();
    }

    // For authenticated users, check cache freshness
    if (!forceRefresh && !isCacheStale(QUEUES_LAST_SYNC_KEY)) {
      return this.getActiveQueuesLocal();
    }

    // Fetch from server
    try {
      const result = await getMyQueues();
      // Filter out closed queues - only show active queues
      const activeServerQueues = result.queues.filter((q: MyQueue) => q.status !== 'closed');
      const serverQueues: StoredQueue[] = activeServerQueues.map((q: MyQueue) => ({
        code: q.shortCode,
        sessionId: q.id,
        wsUrl: '', // Will be rebuilt when needed
        hostAuthToken: '', // Will be recovered from localStorage if available
        eventName: q.eventName || undefined,
        maxGuests: q.maxGuests || undefined,
        location: q.location,
        contactInfo: q.contactInfo,
        openTime: q.openTime,
        closeTime: q.closeTime,
        createdAt: q.createdAt * 1000, // Convert seconds to ms
      }));

      // Merge with local queues to preserve hostAuthTokens and wsUrls
      const localQueues = await this.getActiveQueuesLocal();
      const mergedQueues = await Promise.all(
        serverQueues.map(async (sq) => {
          const local = localQueues.find((lq) => lq.sessionId === sq.sessionId);
          let hostAuthToken = local?.hostAuthToken || sq.hostAuthToken;

          // If no hostAuthToken from local queue data, try dedicated host auth storage
          if (!hostAuthToken && sq.sessionId) {
            const storedToken = await this.getHostAuth(sq.sessionId);
            if (storedToken) {
              hostAuthToken = storedToken;
            }
          }

          if (local) {
            return {
              ...sq,
              wsUrl: local.wsUrl || sq.wsUrl,
              hostAuthToken,
              joinUrl: local.joinUrl || sq.joinUrl,
            };
          }
          return { ...sq, hostAuthToken };
        })
      );

      // Save merged queues to localStorage as cache
      const value = JSON.stringify(mergedQueues);
      if (Platform.OS === 'web') {
        try {
          window.localStorage.setItem(ACTIVE_QUEUES_KEY, value);
        } catch {
          await AsyncStorage.setItem(ACTIVE_QUEUES_KEY, value);
        }
      } else {
        await AsyncStorage.setItem(ACTIVE_QUEUES_KEY, value);
      }

      updateSyncTime(QUEUES_LAST_SYNC_KEY);
      return mergedQueues;
    } catch (error) {
      // Check if this is an auth error (session expired)
      if (isAuthError(error) && onAuthExpired) {
        console.log('Session expired, notifying auth context');
        onAuthExpired();
      }
      console.warn('Failed to fetch queues from server, using local cache:', error);
      // Fall back to local cache on error
      return this.getActiveQueuesLocal();
    }
  },

  async removeQueue(code: string): Promise<void> {
    const queues = await this.getActiveQueuesLocal();
    const updatedQueues = queues.filter((q) => q.code !== code);
    const value = JSON.stringify(updatedQueues);

    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(ACTIVE_QUEUES_KEY, value);
      } catch {
        await AsyncStorage.setItem(ACTIVE_QUEUES_KEY, value);
      }
    } else {
      await AsyncStorage.setItem(ACTIVE_QUEUES_KEY, value);
    }
  },

  // ============================================
  // Host Auth Tokens
  // ============================================

  async setHostAuth(sessionId: string, token: string, code?: string): Promise<void> {
    const sessionKey = `${HOST_AUTH_PREFIX}${sessionId}`;
    const codeKey = code ? `${HOST_AUTH_CODE_PREFIX}${code}` : null;

    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(sessionKey, token);
        if (codeKey) {
          window.localStorage.setItem(codeKey, token);
        }
      } catch (error) {
        console.warn('[storage.setHostAuth] localStorage failed, using AsyncStorage:', error);
        await AsyncStorage.setItem(sessionKey, token);
        if (codeKey) {
          await AsyncStorage.setItem(codeKey, token);
        }
      }
    } else {
      await AsyncStorage.setItem(sessionKey, token);
      if (codeKey) {
        await AsyncStorage.setItem(codeKey, token);
      }
    }
  },

  async getHostAuth(sessionId: string): Promise<string | null> {
    const key = `${HOST_AUTH_PREFIX}${sessionId}`;
    if (Platform.OS === 'web') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return AsyncStorage.getItem(key);
      }
    }
    return AsyncStorage.getItem(key);
  },

  async getHostAuthByCode(code: string): Promise<string | null> {
    const key = `${HOST_AUTH_CODE_PREFIX}${code}`;
    if (Platform.OS === 'web') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return AsyncStorage.getItem(key);
      }
    }
    return AsyncStorage.getItem(key);
  },

  async removeHostAuth(sessionId: string): Promise<void> {
    const key = `${HOST_AUTH_PREFIX}${sessionId}`;
    if (Platform.OS === 'web') {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        // Fallback to AsyncStorage on web if localStorage fails
      }
    }
    await AsyncStorage.removeItem(key);
  },

  /**
   * Clear all host auth tokens from storage.
   * Called on logout to ensure host tokens don't persist.
   */
  async clearAllHostAuth(): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        // Find and remove all host auth tokens from localStorage
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(HOST_AUTH_PREFIX)) {
            keysToRemove.push(key);
          }
        }
        for (const key of keysToRemove) {
          window.localStorage.removeItem(key);
        }
        return;
      } catch {
        // Fallback to AsyncStorage on web if localStorage fails
      }
    }

    // For native apps, get all keys and filter for host auth tokens
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const hostAuthKeys = allKeys.filter((key) => key.startsWith(HOST_AUTH_PREFIX));
      if (hostAuthKeys.length > 0) {
        await AsyncStorage.multiRemove(hostAuthKeys);
      }
    } catch (error) {
      console.warn('Failed to clear host auth tokens:', error);
    }
  },

  // ============================================
  // Joined Queues (Guest memberships)
  // ============================================

  async setJoinedQueue(queue: StoredJoinedQueue): Promise<void> {
    // Get current queues first
    let queues = await this.getJoinedQueuesLocal();

    // Safety check: if we got an empty array but there should be data, retry once
    if (
      queues.length === 0 &&
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      window.localStorage.getItem(JOINED_QUEUES_KEY)
    ) {
      console.warn('Detected potential storage read issue, retrying...');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retryQueues = await this.getJoinedQueuesLocal();
      if (retryQueues.length > 0) {
        console.log('Successfully recovered queues on retry');
        queues = retryQueues;
      }
    }

    // Update queues, keeping existing ones and adding/updating the new one
    const updatedQueues = [
      ...queues.filter((q: StoredJoinedQueue) => q.code !== queue.code),
      queue,
    ];
    const value = JSON.stringify(updatedQueues);

    // Double check we're not about to write an empty array when we shouldn't
    if (updatedQueues.length === 0 && queues.length > 0) {
      console.error('Prevented writing empty array when data exists');
      return;
    }

    if (Platform.OS === 'web') {
      try {
        // Write to localStorage first
        window.localStorage.setItem(JOINED_QUEUES_KEY, value);
        // Verify the write was successful
        const verification = window.localStorage.getItem(JOINED_QUEUES_KEY);
        if (!verification) {
          throw new Error('Storage write verification failed');
        }
      } catch (error) {
        console.warn('localStorage operation failed, falling back to AsyncStorage', error);
        await AsyncStorage.setItem(JOINED_QUEUES_KEY, value);
      }
    } else {
      await AsyncStorage.setItem(JOINED_QUEUES_KEY, value);
    }
  },

  /**
   * Get joined queues from localStorage only (for offline/guest mode)
   */
  async getJoinedQueuesLocal(): Promise<StoredJoinedQueue[]> {
    let value: string | null = null;

    if (Platform.OS === 'web') {
      try {
        value = window.localStorage.getItem(JOINED_QUEUES_KEY);
        if (!value) {
          // If localStorage is empty, check AsyncStorage as fallback
          value = await AsyncStorage.getItem(JOINED_QUEUES_KEY);
        }
      } catch {
        value = await AsyncStorage.getItem(JOINED_QUEUES_KEY);
      }
    } else {
      value = await AsyncStorage.getItem(JOINED_QUEUES_KEY);
    }

    try {
      return value ? JSON.parse(value) : [];
    } catch (error) {
      console.error('Error parsing joined queues:', error);
      return [];
    }
  },

  /**
   * Get joined queues - server-first for logged in users, localStorage for guests
   * @param isAuthenticated - Whether the user is logged in
   * @param forceRefresh - Force server fetch even if cache is fresh
   */
  async getJoinedQueues(
    isAuthenticated: boolean = false,
    forceRefresh: boolean = false
  ): Promise<StoredJoinedQueue[]> {
    // For unauthenticated users, use localStorage only
    if (!isAuthenticated) {
      return this.getJoinedQueuesLocal();
    }

    // For authenticated users, check cache freshness
    if (!forceRefresh && !isCacheStale(MEMBERSHIPS_LAST_SYNC_KEY)) {
      return this.getJoinedQueuesLocal();
    }

    // Fetch from server
    try {
      const result = await getMyMemberships();
      const serverQueues: StoredJoinedQueue[] = result.memberships
        .filter((m: QueueMembership) => m.status === 'waiting' || m.status === 'called')
        .map((m: QueueMembership) => ({
          code: m.queue.shortCode,
          sessionId: m.sessionId,
          partyId: m.partyId,
          eventName: m.queue.eventName || undefined,
          joinedAt: m.joinedAt * 1000, // Convert seconds to ms
        }));

      // Merge with local queues (local queues not on server might be from other devices/sessions)
      const localQueues = await this.getJoinedQueuesLocal();

      // Keep server queues and local queues that aren't already on server
      const serverCodes = new Set(serverQueues.map((q) => q.code));
      const uniqueLocalQueues = localQueues.filter((lq) => !serverCodes.has(lq.code));
      const mergedQueues = [...serverQueues, ...uniqueLocalQueues];

      // Save merged queues to localStorage as cache
      const value = JSON.stringify(mergedQueues);
      if (Platform.OS === 'web') {
        try {
          window.localStorage.setItem(JOINED_QUEUES_KEY, value);
        } catch {
          await AsyncStorage.setItem(JOINED_QUEUES_KEY, value);
        }
      } else {
        await AsyncStorage.setItem(JOINED_QUEUES_KEY, value);
      }

      updateSyncTime(MEMBERSHIPS_LAST_SYNC_KEY);
      return mergedQueues;
    } catch (error) {
      // Check if this is an auth error (session expired)
      if (isAuthError(error) && onAuthExpired) {
        console.log('Session expired, notifying auth context');
        onAuthExpired();
      }
      console.warn('Failed to fetch memberships from server, using local cache:', error);
      // Fall back to local cache on error
      return this.getJoinedQueuesLocal();
    }
  },

  async removeJoinedQueue(code: string): Promise<void> {
    // Get current queues first
    let queues = await this.getJoinedQueuesLocal();

    // Safety check: if we got an empty array but there should be data, retry once
    if (
      queues.length === 0 &&
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      window.localStorage.getItem(JOINED_QUEUES_KEY)
    ) {
      console.warn('Detected potential storage read issue, retrying...');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retryQueues = await this.getJoinedQueuesLocal();
      if (retryQueues.length > 0) {
        console.log('Successfully recovered queues on retry');
        queues = retryQueues;
      }
    }

    const updatedQueues = queues.filter((q: StoredJoinedQueue) => q.code !== code);
    const value = JSON.stringify(updatedQueues);

    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(JOINED_QUEUES_KEY, value);
      } catch {
        await AsyncStorage.setItem(JOINED_QUEUES_KEY, value);
      }
    } else {
      await AsyncStorage.setItem(JOINED_QUEUES_KEY, value);
    }
  },

  // ============================================
  // Trust Survey
  // ============================================

  async setTrustSurveyResponse(
    code: string,
    partyId: string,
    response: TrustSurveyResponse
  ): Promise<void> {
    const key = `${TRUST_SURVEY_PREFIX}${code}:${partyId}`;
    const value = JSON.stringify(response);
    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        await AsyncStorage.setItem(key, value);
        return;
      }
    }
    await AsyncStorage.setItem(key, value);
  },

  async getTrustSurveyResponse(code: string, partyId: string): Promise<TrustSurveyResponse | null> {
    const key = `${TRUST_SURVEY_PREFIX}${code}:${partyId}`;
    let value: string | null = null;
    if (Platform.OS === 'web') {
      try {
        value = window.localStorage.getItem(key);
        if (!value) {
          value = await AsyncStorage.getItem(key);
        }
      } catch {
        value = await AsyncStorage.getItem(key);
      }
    } else {
      value = await AsyncStorage.getItem(key);
    }
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value) as TrustSurveyResponse;
    } catch (error) {
      console.warn('Failed to parse trust survey response', error);
      return null;
    }
  },

  async removeTrustSurveyResponse(code: string, partyId: string): Promise<void> {
    const key = `${TRUST_SURVEY_PREFIX}${code}:${partyId}`;
    if (Platform.OS === 'web') {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        await AsyncStorage.removeItem(key);
        return;
      }
    }
    await AsyncStorage.removeItem(key);
  },

  // ============================================
  // Queue Migration (on login)
  // ============================================

  /**
   * Migrate localStorage queues to server when user logs in
   * This claims ownership/membership of local queues to the user's account
   */
  async migrateQueuesToServer(): Promise<{ claimedOwned: number; claimedJoined: number }> {
    try {
      const localOwned = await this.getActiveQueuesLocal();
      const localJoined = await this.getJoinedQueuesLocal();

      // Prepare data for claiming
      const ownedQueues = localOwned
        .filter((q) => q.hostAuthToken) // Only claim if we have host auth
        .map((q) => ({
          sessionId: q.sessionId,
          hostAuthToken: q.hostAuthToken,
        }));

      const joinedQueues = localJoined.map((q) => ({
        sessionId: q.sessionId,
        partyId: q.partyId,
      }));

      if (ownedQueues.length === 0 && joinedQueues.length === 0) {
        return { claimedOwned: 0, claimedJoined: 0 };
      }

      const result = await claimQueues({ ownedQueues, joinedQueues });
      return {
        claimedOwned: result.claimedOwned,
        claimedJoined: result.claimedJoined,
      };
    } catch (error) {
      console.error('Failed to migrate queues to server:', error);
      return { claimedOwned: 0, claimedJoined: 0 };
    }
  },

  /**
   * Invalidate cache to force refresh on next fetch
   */
  invalidateCache(): void {
    if (Platform.OS === 'web') {
      try {
        window.localStorage.removeItem(QUEUES_LAST_SYNC_KEY);
        window.localStorage.removeItem(MEMBERSHIPS_LAST_SYNC_KEY);
      } catch {
        // Ignore
      }
    }
  },
};
