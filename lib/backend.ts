import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_LOCALHOST = Platform.select({
  ios: 'http://127.0.0.1:8787',
  android: 'http://10.0.2.2:8787',
  default: 'http://localhost:8787',
});

// Session storage key - must match AuthContext
const AUTH_SESSION_KEY = 'queueup-auth-session';

/**
 * Get stored session token for authenticated API calls
 * Works across web (localStorage) and native (AsyncStorage)
 */
async function getStoredSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
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

/**
 * Build headers for authenticated API requests
 * Includes Bearer token if available (for cross-origin scenarios)
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'content-type': 'application/json',
  };

  const token = await getStoredSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const apiBaseUrlWithDefault = rawApiBaseUrl ?? DEFAULT_LOCALHOST;
const apiBaseUrlSanitized = apiBaseUrlWithDefault ? apiBaseUrlWithDefault.replace(/\/$/, '') : '';
export const API_BASE_URL = apiBaseUrlSanitized ?? '';

export interface CreateQueueResult {
  code: string;
  sessionId: string;
  joinUrl: string;
  wsUrl: string;
  hostAuthToken?: string;
  eventName?: string;
  maxGuests: number;
  location?: string | null;
  contactInfo?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
  requiresAuth?: boolean;
  ownerId?: string | null;
}

export interface CreateQueueParams {
  eventName: string;
  maxGuests: number;
  turnstileToken?: string;
  location?: string;
  contactInfo?: string;
  openTime?: string;
  closeTime?: string;
  requiresAuth?: boolean;
}

export const HOST_COOKIE_NAME = 'queue_host_auth';
const WEBSOCKET_PROTOCOL_HTTP = /^http:/i;
const WEBSOCKET_PROTOCOL_HTTPS = /^https:/i;

function extractHostToken(setCookieHeader: string | null): string | undefined {
  if (!setCookieHeader) {
    return undefined;
  }

  // React Native fetch collapses multiple Set-Cookie headers into a comma-separated string.
  const maybeCookies = setCookieHeader.split(',');
  for (const maybeCookie of maybeCookies) {
    const cookie = maybeCookie.trim();
    if (!cookie.startsWith(`${HOST_COOKIE_NAME}=`)) {
      continue;
    }
    const firstPart = cookie.split(';', 1)[0];
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const value = firstPart.slice(eqIndex + 1);
    if (value) {
      return value;
    }
  }

  return undefined;
}

const MIN_QUEUE_CAPACITY = 1;
const MAX_QUEUE_CAPACITY = 100;

export async function createQueue({
  eventName,
  maxGuests,
  turnstileToken,
  location,
  contactInfo,
  openTime,
  closeTime,
  requiresAuth,
}: CreateQueueParams): Promise<CreateQueueResult> {
  const trimmedEventName = eventName.trim();
  const normalizedMaxGuests = Number.isFinite(maxGuests)
    ? Math.min(MAX_QUEUE_CAPACITY, Math.max(MIN_QUEUE_CAPACITY, Math.round(maxGuests)))
    : MAX_QUEUE_CAPACITY;
  const normalizedLocation = location?.trim();
  const normalizedContactInfo = contactInfo?.trim();
  const body = {
    eventName: trimmedEventName,
    maxGuests: normalizedMaxGuests,
    ...(normalizedLocation ? { location: normalizedLocation } : {}),
    ...(normalizedContactInfo ? { contactInfo: normalizedContactInfo } : {}),
    ...(openTime ? { openTime } : {}),
    ...(closeTime ? { closeTime } : {}),
    ...(turnstileToken && { turnstileToken }),
    ...(requiresAuth !== undefined && { requiresAuth }),
  };
  // Include auth headers for owner identification (needed for requiresAuth feature)
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/queue/create`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await buildError(response);
  }

  const data = (await response.json()) as CreateQueueResult;
  const hostAuthToken = data.hostAuthToken ?? extractHostToken(response.headers.get('set-cookie'));
  const resolvedOpenTime = data.openTime ?? openTime;
  const resolvedCloseTime = data.closeTime ?? closeTime;
  return { ...data, hostAuthToken, openTime: resolvedOpenTime, closeTime: resolvedCloseTime };
}

export interface JoinQueueParams {
  code: string;
  name?: string;
  size?: number;
  turnstileToken?: string;
}

export interface JoinQueueResult {
  partyId: string;
  position: number;
  sessionId?: string;
  queueLength?: number;
  estimatedWaitMs?: number;
  eventName?: string;
}

export interface JoinQueueError extends Error {
  requiresAuth?: boolean;
  existingPartyId?: string;
}

export async function joinQueue({
  code,
  name,
  size,
  turnstileToken,
}: JoinQueueParams): Promise<JoinQueueResult> {
  const payload = {
    name: name?.trim() || undefined,
    size: size && Number.isFinite(size) ? size : undefined,
    ...(turnstileToken && { turnstileToken }),
  };

  const response = await fetch(`${API_BASE_URL}/api/queue/${code.toUpperCase()}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include', // Include session cookie for auth
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await buildJoinError(response);
    throw error;
  }

  return (await response.json()) as JoinQueueResult;
}

async function buildJoinError(response: Response): Promise<JoinQueueError> {
  try {
    const data = await response.json();
    const message = typeof data?.error === 'string' ? data.error : JSON.stringify(data);
    const error = new Error(
      message || `Request failed with status ${response.status}`
    ) as JoinQueueError;

    // Attach requiresAuth flag if present
    if (data?.requiresAuth === true) {
      error.requiresAuth = true;
    }

    // Attach existingPartyId if user already in queue
    if (typeof data?.existingPartyId === 'string') {
      error.existingPartyId = data.existingPartyId;
    }

    return error;
  } catch {
    const text = await response.text();
    return new Error(text || `Request failed with status ${response.status}`) as JoinQueueError;
  }
}

export interface LeaveQueueParams {
  code: string;
  partyId: string;
}

export async function leaveQueue({ code, partyId }: LeaveQueueParams): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/queue/${code.toUpperCase()}/leave`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ partyId }),
  });

  if (!response.ok) {
    throw await buildError(response);
  }
}

function toWebSocketUrl(url: string): string {
  if (WEBSOCKET_PROTOCOL_HTTPS.test(url)) {
    return url.replace(WEBSOCKET_PROTOCOL_HTTPS, 'wss:');
  }
  if (WEBSOCKET_PROTOCOL_HTTP.test(url)) {
    return url.replace(WEBSOCKET_PROTOCOL_HTTP, 'ws:');
  }
  return url;
}

/**
 * Build the WebSocket URL for host connections.
 *
 * SECURITY NOTE: Host authentication is now done via headers only (x-host-auth or cookie).
 * Query string tokens are no longer supported to prevent token leakage via Referer headers.
 *
 * @deprecated WebSocket connections should set x-host-auth header instead of using this function.
 * Use buildHostWsUrlFromCode() and set the header in your WebSocket client.
 */
export function buildHostConnectUrl(wsUrl: string, _hostAuthToken?: string): string {
  // No longer include token in URL - must use headers
  return toWebSocketUrl(wsUrl);
}

/**
 * Build the WebSocket URL for a host given a queue code
 * Used when navigating to HostQueueScreen from HostDashboard
 */
export function buildHostWsUrlFromCode(code: string): string {
  const normalizedCode = code.toUpperCase();
  const base = `${API_BASE_URL || DEFAULT_LOCALHOST}/api/queue/${normalizedCode}/connect`;
  return toWebSocketUrl(base);
}

export function buildGuestConnectUrl(code: string, partyId: string): string {
  const normalizedCode = code.toUpperCase();
  const base = `${API_BASE_URL || DEFAULT_LOCALHOST}/api/queue/${normalizedCode}/connect`;
  try {
    const parsed = new URL(base);
    parsed.searchParams.set('partyId', partyId);
    return toWebSocketUrl(parsed.toString());
  } catch {
    const separator = base.includes('?') ? '&' : '?';
    return toWebSocketUrl(`${base}${separator}partyId=${encodeURIComponent(partyId)}`);
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/push/vapid`);
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey: string | null };
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

// Minimal PushSubscription-like type to avoid DOM typing requirements in RN builds
export interface PushSubscriptionParams {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  expirationTime?: number | null;
  options?: unknown;
  [key: string]: unknown; // Allow extra fields for flexibility
}

export async function savePushSubscription(params: {
  sessionId: string;
  partyId: string;
  subscription: PushSubscriptionParams;
}): Promise<void> {
  const body = {
    sessionId: params.sessionId,
    partyId: params.partyId,
    subscription: params.subscription,
  };
  const res = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error('Failed to save subscription');
  }
}

export interface AdvanceQueueParams {
  code: string;
  hostAuthToken: string;
  servedPartyId?: string;
  nextPartyId?: string;
}

export interface HostParty {
  id: string;
  name?: string;
  size?: number;
  status: 'waiting' | 'called';
  nearby: boolean;
  joinedAt: number;
}

export interface AdvanceQueueResult {
  nowServing: HostParty | null;
}

export async function advanceQueueHost({
  code,
  hostAuthToken,
  servedPartyId,
  nextPartyId,
}: AdvanceQueueParams): Promise<AdvanceQueueResult> {
  const payload = {
    servedParty: servedPartyId,
    nextParty: nextPartyId,
  };

  const response = await fetch(`${API_BASE_URL}/api/queue/${code.toUpperCase()}/advance`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-host-auth': hostAuthToken,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await buildError(response);
  }

  return (await response.json()) as AdvanceQueueResult;
}

export interface CloseQueueParams {
  code: string;
  hostAuthToken: string;
}

export async function closeQueueHost({ code, hostAuthToken }: CloseQueueParams): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/queue/${code.toUpperCase()}/close`, {
    method: 'POST',
    headers: {
      'x-host-auth': hostAuthToken,
    },
  });

  if (!response.ok) {
    throw await buildError(response);
  }
}

async function buildError(response: Response): Promise<Error> {
  try {
    const data = await response.json();
    const message = typeof data?.error === 'string' ? data.error : JSON.stringify(data);
    return new Error(message || `Request failed with status ${response.status}`);
  } catch {
    const text = await response.text();
    return new Error(text || `Request failed with status ${response.status}`);
  }
}

export interface QueueStats {
  activeCount: number;
  servedCount: number;
  leftCount: number;
  noShowCount: number;
  avgWaitSeconds: number | null;
}

export interface MyQueue {
  id: string;
  shortCode: string;
  eventName: string | null;
  status: string;
  createdAt: number;
  maxGuests: number | null;
  location: string | null;
  contactInfo: string | null;
  openTime: string | null;
  closeTime: string | null;
  requiresAuth: boolean;
  stats: QueueStats;
}

export interface GetMyQueuesResult {
  queues: MyQueue[];
}

export async function getMyQueues(): Promise<GetMyQueuesResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/queues/mine`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw await buildError(response);
  }

  return (await response.json()) as GetMyQueuesResult;
}

// Types for user memberships (queues joined as guest)
export interface QueueMembership {
  partyId: string;
  sessionId: string;
  name: string | null;
  size: number;
  status: string;
  joinedAt: number;
  calledAt: number | null;
  completedAt: number | null;
  queue: {
    shortCode: string;
    eventName: string | null;
    status: string;
    location: string | null;
    contactInfo: string | null;
  };
}

export interface GetMyMembershipsResult {
  memberships: QueueMembership[];
}

/**
 * Get all queues the authenticated user has joined as a guest
 */
export async function getMyMemberships(): Promise<GetMyMembershipsResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/user/memberships`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw await buildError(response);
  }

  return (await response.json()) as GetMyMembershipsResult;
}

export interface ClaimQueuesParams {
  ownedQueues?: { sessionId: string; hostAuthToken: string }[];
  joinedQueues?: { sessionId: string; partyId: string }[];
}

export interface ClaimQueuesResult {
  success: boolean;
  claimedOwned: number;
  claimedJoined: number;
}

/**
 * Claim localStorage queues to the authenticated user's account
 * Called after login to migrate local queue data to server
 */
export async function claimQueues(params: ClaimQueuesParams): Promise<ClaimQueuesResult> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/user/claim-queues`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await buildError(response);
  }

  return (await response.json()) as ClaimQueuesResult;
}
