import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  ToastAndroid,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';
import type { RootStackParamList } from '../../types/navigation';
import styles from './HostQueueScreen.Styles';
import { advanceQueueHost, closeQueueHost, HostParty, API_BASE_URL } from '../../lib/backend';
import { Feather } from '@expo/vector-icons';
import { Lock, Users } from 'lucide-react-native';
import { storage } from '../../utils/storage';
import { useAuth } from '../../contexts/AuthContext';
import Timer from '../Timer';
import { trackEvent } from '../../utils/analytics';
import { generatePosterImage } from './posterGenerator';
import PosterNative, { PosterNativeHandle } from './PosterNative';

type Props = NativeStackScreenProps<RootStackParamList, 'HostQueueScreen'>;

const ANALYTICS_SCREEN = 'host_console';

function formatTimeLabel(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const minuteString = minutes.toString().padStart(2, '0');
  return `${displayHours}:${minuteString} ${period}`;
}

function formatScheduleLine(openTime?: string | null, closeTime?: string | null): string | null {
  const openLabel = formatTimeLabel(openTime);
  const closeLabel = formatTimeLabel(closeTime);
  if (openLabel && closeLabel) {
    return `${openLabel} – ${closeLabel}`;
  }
  if (openLabel) {
    return `Opens ${openLabel}`;
  }
  if (closeLabel) {
    return `Closes ${closeLabel}`;
  }
  return null;
}

type HostMessage =
  | {
      type: 'queue_update';
      queue?: HostParty[];
      nowServing?: HostParty | null;
      maxGuests?: number;
      callDeadline?: number | null;
    }
  | Record<string, unknown>;

type ConnectionState = 'connecting' | 'open' | 'closed';

const POLL_INTERVAL_MS = 10000; // Poll every 10 seconds

export default function HostQueueScreen({ route, navigation }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const {
    code,
    sessionId: initialSessionId,
    wsUrl: initialWsUrl,
    hostAuthToken: initialHostAuthToken,
    joinUrl: initialJoinUrl,
    eventName: initialEventName,
    maxGuests: initialMaxGuests,
    location: initialLocation,
    contactInfo: initialContactInfo,
    openTime: initialOpenTime,
    closeTime: initialCloseTime,
    requiresAuth: initialRequiresAuth,
  } = route.params;

  // State for recovered params (when missing from route params on page refresh)
  const [recoveredParams, setRecoveredParams] = useState<{
    sessionId?: string;
    wsUrl?: string;
    joinUrl?: string;
    hostAuthToken?: string;
    eventName?: string;
    maxGuests?: number;
    location?: string | null;
    contactInfo?: string | null;
    openTime?: string | null;
    closeTime?: string | null;
    requiresAuth?: boolean;
  } | null>(null);
  const [isRecoveringParams, setIsRecoveringParams] = useState(!initialSessionId || !initialWsUrl);

  // Effective params: use route params if available, otherwise use recovered values
  const sessionId = initialSessionId || recoveredParams?.sessionId;
  const wsUrl = initialWsUrl || recoveredParams?.wsUrl;
  const joinUrl = initialJoinUrl || recoveredParams?.joinUrl;
  const eventName = initialEventName || recoveredParams?.eventName;
  const location = initialLocation ?? recoveredParams?.location;
  const contactInfo = initialContactInfo ?? recoveredParams?.contactInfo;
  const openTime = initialOpenTime ?? recoveredParams?.openTime;
  const closeTime = initialCloseTime ?? recoveredParams?.closeTime;
  const requiresAuth = initialRequiresAuth ?? recoveredParams?.requiresAuth ?? false;

  // Recover params from storage when missing (e.g., page refresh)
  useEffect(() => {
    if ((initialSessionId && initialWsUrl) || !code) {
      setIsRecoveringParams(false);
      return;
    }

    // Wait for auth loading to complete before trying to recover
    // This prevents a race condition where we try to fetch queues before knowing auth state
    if (isAuthLoading) {
      return;
    }

    const recoverParams = async () => {
      try {
        const activeQueues = await storage.getActiveQueues(isAuthenticated, true);
        const activeQueue = activeQueues.find((q) => q.code === code);
        if (activeQueue?.sessionId) {
          // Try to get host auth token from dedicated storage as fallback
          // This is important because the merged queue data from server may not include hostAuthToken
          let hostAuthToken = activeQueue.hostAuthToken;
          if (!hostAuthToken && activeQueue.sessionId) {
            const storedToken = await storage.getHostAuth(activeQueue.sessionId);
            if (storedToken) {
              hostAuthToken = storedToken;
            }
          }
          // Also try by code as another fallback
          if (!hostAuthToken && code) {
            const storedTokenByCode = await storage.getHostAuthByCode(code);
            if (storedTokenByCode) {
              hostAuthToken = storedTokenByCode;
            }
          }

          // Build joinUrl from code if not present in storage
          const joinUrl =
            activeQueue.joinUrl ||
            (typeof window !== 'undefined' && window.location?.origin
              ? `${window.location.origin}/queue/${code}`
              : undefined);

          // Set hostToken directly here to avoid race condition with isRecoveringParams
          if (hostAuthToken) {
            setHostToken(hostAuthToken);
          }

          setRecoveredParams({
            sessionId: activeQueue.sessionId,
            joinUrl,
            hostAuthToken,
            eventName: activeQueue.eventName,
            maxGuests: activeQueue.maxGuests,
            location: activeQueue.location,
            contactInfo: activeQueue.contactInfo,
            openTime: activeQueue.openTime,
            closeTime: activeQueue.closeTime,
            requiresAuth: activeQueue.requiresAuth,
          });
          setIsRecoveringParams(false);
        } else {
          // No stored queue found, redirect to dashboard
          console.warn('No queue found in storage for code:', code);
          navigation.replace('HostDashboardScreen');
        }
      } catch (error) {
        console.error('Failed to recover queue params from storage:', error);
        navigation.replace('HostDashboardScreen');
      }
    };

    void recoverParams();
  }, [code, initialSessionId, initialWsUrl, navigation, isAuthenticated, isAuthLoading]);

  const storageKey = sessionId ? `queueup-host-auth:${sessionId}` : '';
  const storageCodeKey = code ? `queueup-host-auth-code:${code}` : '';

  const displayEventName = eventName?.trim() || null;
  const scheduleLine = useMemo(
    () => formatScheduleLine(openTime, closeTime),
    [openTime, closeTime]
  );
  const [capacity, setCapacity] = useState<number | null>(
    typeof initialMaxGuests === 'number' ? initialMaxGuests : null
  );

  const [hostToken, setHostToken] = useState<string | undefined>(() => {
    if (initialHostAuthToken) {
      return initialHostAuthToken;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Prefer durable localStorage (used by storage.setHostAuth), fall back to sessionStorage
      const fromLocal = storageKey ? window.localStorage.getItem(storageKey) : null;
      const fromLocalCode = storageCodeKey ? window.localStorage.getItem(storageCodeKey) : null;
      const fromSession = storageKey ? window.sessionStorage.getItem(storageKey) : null;
      if (fromLocal) return fromLocal;
      if (fromLocalCode) return fromLocalCode;
      if (fromSession) return fromSession;
    }
    return undefined;
  });

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionErrorModalVisible, setConnectionErrorModalVisible] = useState(false);
  const [queue, setQueue] = useState<HostParty[]>([]);
  const [nowServing, setNowServing] = useState<HostParty | null>(null);
  const [callDeadline, setCallDeadline] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeConfirmVisibleWeb, setCloseConfirmVisibleWeb] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const isWeb = Platform.OS === 'web';
  const [posterModeLoading, setPosterModeLoading] = useState<'color' | 'bw' | null>(null);
  const [posterModalVisible, setPosterModalVisible] = useState(false);
  const [posterImageUrl, setPosterImageUrl] = useState<string | null>(null);
  const [posterBlackWhite, setPosterBlackWhite] = useState(false);
  const [posterGenerating, setPosterGenerating] = useState(false);
  const posterNativeRef = useRef<PosterNativeHandle | null>(null);
  const [nativeQrModalVisible, setNativeQrModalVisible] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
  const qrCodeRef = useRef<any>(null);
  const canGeneratePoster = true; // Web uses canvas, native uses view-shot

  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etag = useRef<string | null>(null);
  const hasInitializedQueue = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clear ETag when entering a new queue session to ensure fresh data
  useEffect(() => {
    etag.current = null;
    hasInitializedQueue.current = false;
  }, [code, sessionId]);

  // If we were navigated here without a host token (e.g., after logout/login),
  // try to recover it from persistent storage using the sessionId.
  useEffect(() => {
    if (hostToken || !sessionId) return;

    (async () => {
      try {
        const stored = await storage.getHostAuth(sessionId);
        const storedByCode = stored ? null : await storage.getHostAuthByCode(code);
        if (stored) {
          setHostToken(stored);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.sessionStorage.setItem(storageKey, stored);
          }
        } else if (storedByCode) {
          setHostToken(storedByCode);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (storageKey) window.sessionStorage.setItem(storageKey, storedByCode);
            if (storageCodeKey) window.sessionStorage.setItem(storageCodeKey, storedByCode);
          }
        }
      } catch (err) {
        console.warn('Failed to recover host auth from storage', err);
      }
    })();
  }, [hostToken, sessionId, storageKey, storageCodeKey, code]);

  useEffect(() => {
    if (!initialHostAuthToken) {
      return;
    }
    setHostToken(initialHostAuthToken);
    // Persist host auth and queue info for cross-platform return-to-queue buttons
    (async () => {
      if (!sessionId || !wsUrl) return;
      try {
        await storage.setHostAuth(sessionId, initialHostAuthToken);
        await storage.setActiveQueue({
          code,
          sessionId,
          wsUrl,
          hostAuthToken: initialHostAuthToken,
          joinUrl,
          eventName,
          maxGuests: initialMaxGuests,
          location,
          contactInfo,
          openTime,
          closeTime,
          createdAt: Date.now(),
        });
      } catch {
        // Ignore storage errors (e.g. private mode)
      }
    })();
  }, [
    initialHostAuthToken,
    storageKey,
    code,
    sessionId,
    wsUrl,
    joinUrl,
    eventName,
    initialMaxGuests,
  ]);

  const snapshotUrl = useMemo(() => {
    if (!code) return null;
    return `${API_BASE_URL}/api/queue/${code.toUpperCase()}/snapshot`;
  }, [code]);
  // Allow host actions if we have a local token OR if user is authenticated (backend will verify ownership)
  const hasHostAuth = Boolean(hostToken) || isAuthenticated;
  const recoveringHostAuth = !hasHostAuth && Boolean(sessionId);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  }, []);

  const handleSnapshot = useCallback((snapshot: HostMessage) => {
    try {
      if (snapshot.type === 'queue_update') {
        const queueEntries = Array.isArray(snapshot.queue) ? (snapshot.queue as HostParty[]) : [];
        const serving = (snapshot.nowServing ?? null) as HostParty | null;
        setQueue(queueEntries);
        setNowServing(serving);
        if (typeof snapshot.maxGuests === 'number') {
          setCapacity(snapshot.maxGuests);
        }
        const deadlineValue =
          typeof snapshot.callDeadline === 'number' ? snapshot.callDeadline : null;
        setCallDeadline(serving ? deadlineValue : null);
        if (queueEntries.length > 0 || serving) {
          setClosed(false);
        }
        setConnectionError(null);
      } else if (snapshot.type === 'closed') {
        setQueue([]);
        setNowServing(null);
        setCallDeadline(null);
        setClosed(true);
      }
    } catch {
      // ignore malformed payloads
    }
  }, []);

  const poll = useCallback(async () => {
    // Need either hostToken OR isAuthenticated (backend verifies ownership for authenticated users)
    if (!hasHostAuth || !snapshotUrl) {
      return;
    }

    // Create a new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const headers: HeadersInit = {};
      // Include host token if available (for non-authenticated users or as fallback)
      if (hostToken) {
        headers['x-host-auth'] = hostToken;
      }
      // Only send If-None-Match if we've already initialized the queue state
      // This ensures the first poll always fetches data
      if (etag.current && hasInitializedQueue.current) {
        headers['If-None-Match'] = etag.current;
      }

      const response = await fetch(snapshotUrl, {
        headers,
        credentials: 'include', // Include auth cookies for authenticated users
        cache: 'no-store', // Bypass Safari's aggressive caching
        signal: controller.signal,
      });

      // Check if this request was aborted
      if (controller.signal.aborted) {
        return;
      }

      if (response.status === 304) {
        // No changes, connection is healthy
        // Only skip update if we've already initialized the queue
        if (hasInitializedQueue.current) {
          setConnectionState('open');
          setConnectionError(null);
          return;
        }
        // If we haven't initialized yet, we need to fetch data
        // Retry without If-None-Match header to force a fresh fetch
        const retryHeaders: HeadersInit = {};
        if (hostToken) {
          retryHeaders['x-host-auth'] = hostToken;
        }
        const retryResponse = await fetch(snapshotUrl, {
          headers: retryHeaders,
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        if (retryResponse.ok) {
          const newEtag = retryResponse.headers.get('ETag');
          if (newEtag) {
            etag.current = newEtag;
          }
          const data = await retryResponse.json();
          handleSnapshot(data);
          hasInitializedQueue.current = true;
          setConnectionState('open');
          setConnectionError(null);
          setConnectionErrorModalVisible(false);
        }
        return;
      }

      if (response.ok) {
        const newEtag = response.headers.get('ETag');
        if (newEtag) {
          etag.current = newEtag;
        }
        const data = await response.json();
        handleSnapshot(data);
        hasInitializedQueue.current = true;
        setConnectionState('open');
        setConnectionError(null);
        setConnectionErrorModalVisible(false);
      } else {
        console.warn('[HostQueueScreen] Poll failed:', response.status);
        setConnectionError(`Poll failed: ${response.status}`);
        setConnectionErrorModalVisible(true);
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('[HostQueueScreen] Poll error:', error);
      setConnectionError('Unable to connect to the server');
      setConnectionErrorModalVisible(true);
    }
  }, [hasHostAuth, hostToken, snapshotUrl, handleSnapshot]);

  const startPolling = useCallback(() => {
    if (!hasHostAuth) {
      setConnectionState('closed');
      setConnectionError(
        'Missing host authentication. Reopen the host controls on the device that created this queue.'
      );
      setConnectionErrorModalVisible(true);
      return;
    }

    clearReconnectTimeout();
    stopPolling();
    setConnectionState('connecting');
    setConnectionError(null);

    // Poll immediately
    poll();

    // Then poll every POLL_INTERVAL_MS
    pollInterval.current = setInterval(() => {
      poll();
    }, POLL_INTERVAL_MS);
  }, [hasHostAuth, clearReconnectTimeout, stopPolling, poll]);

  // Handle visibility changes - pause polling when tab is hidden, resume when visible
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - poll immediately and restart interval
        if (
          hasHostAuth &&
          snapshotUrl &&
          !isRecoveringParams &&
          !recoveringHostAuth &&
          isAuthenticated
        ) {
          // Clear stale ETag to force fresh data after being backgrounded
          etag.current = null;
          poll();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasHostAuth, snapshotUrl, isRecoveringParams, recoveringHostAuth, isAuthenticated, poll]);

  useEffect(() => {
    // Don't show auth error while still recovering params from storage or host auth
    // Also pause if the user has logged out
    if (isRecoveringParams || recoveringHostAuth || !isAuthenticated) {
      return;
    }

    if (!hasHostAuth) {
      setConnectionState('closed');
      setConnectionError(
        'Missing host authentication. Reopen the host controls on the device that created this queue.'
      );
      setConnectionErrorModalVisible(true);
      return;
    }
    startPolling();
    return () => {
      clearReconnectTimeout();
      stopPolling();
      // Cancel any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [
    startPolling,
    clearReconnectTimeout,
    stopPolling,
    hasHostAuth,
    isRecoveringParams,
    recoveringHostAuth,
    isAuthenticated,
  ]);

  const queueCount = queue.length;
  const shareableLink = useMemo(() => {
    if (joinUrl) return joinUrl;
    // On web, use current origin
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/queue/${code}`;
    }
    // On mobile, use production URL
    return `https://forkfriends.github.io/queueup/queue/${code}`;
  }, [joinUrl, code]);
  // QR code URL includes src=qr param for tracking scans vs manual entry
  const qrCodeLink = useMemo(() => {
    if (!shareableLink) return null;
    const url = new URL(shareableLink);
    url.searchParams.set('src', 'qr');
    return url.toString();
  }, [shareableLink]);
  const buildPosterDetails = useCallback(() => {
    const lines: string[] = [];
    if (displayEventName) {
      lines.push(displayEventName);
    } else {
      lines.push(`Queue ${code}`);
    }
    if (scheduleLine && !lines.includes(scheduleLine)) {
      lines.push(scheduleLine);
    }
    if (typeof location === 'string' && location.trim().length > 0) {
      lines.push(location.trim());
    }
    const trimmedContact = typeof contactInfo === 'string' ? contactInfo.trim() : '';
    const isMeaningfulContact =
      trimmedContact.length > 0 && !/^(no|n\/a|none|na|-|--)$/i.test(trimmedContact);
    if (isMeaningfulContact) {
      lines.push(trimmedContact);
    } else if (typeof capacity === 'number') {
      lines.push(`Max ${capacity} guests`);
    } else if (!lines.some((line) => line.includes(code))) {
      lines.push(`Code ${code}`);
    }

    return lines;
  }, [capacity, code, contactInfo, displayEventName, location, scheduleLine, shareableLink]);

  const disabledAdvance =
    !hasHostAuth || actionLoading || closeLoading || closed || (queueCount === 0 && !nowServing);
  const disabledClose = !hasHostAuth || closeLoading || closed;

  const trackHostAction = useCallback(
    (event: Parameters<typeof trackEvent>[0], props?: Record<string, unknown>) => {
      void trackEvent(event, {
        sessionId,
        queueCode: code,
        props: {
          screen: ANALYTICS_SCREEN,
          ...(props ?? {}),
        },
      });
    },
    [code, sessionId]
  );

  const advance = useCallback(
    async (nextPartyId?: string) => {
      if (!hasHostAuth || actionLoading) {
        return;
      }
      setActionLoading(true);
      try {
        const result = await advanceQueueHost({
          code,
          hostAuthToken: hostToken, // Optional - backend will verify ownership via session for authenticated users
          servedPartyId: nowServing?.id,
          nextPartyId,
        });
        const updatedNowServing = result.nowServing ?? null;
        setNowServing(updatedNowServing);
        if (!updatedNowServing) {
          setCallDeadline(null);
        }
        setConnectionError(null);
        trackHostAction(nextPartyId ? 'host_call_specific' : 'host_call_next', {
          targetPartyId: nextPartyId ?? updatedNowServing?.id ?? null,
          queueLength: queue.length,
        });
        await poll();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to advance queue';
        Alert.alert('Unable to advance', message);
      } finally {
        setActionLoading(false);
      }
    },
    [
      actionLoading,
      code,
      hasHostAuth,
      hostToken,
      nowServing?.id,
      poll,
      queue.length,
      trackHostAction,
    ]
  );

  const advanceSpecific = useCallback(
    (partyId: string) => {
      advance(partyId);
    },
    [advance]
  );

  const advanceCurrent = useCallback(() => {
    advance();
  }, [advance]);

  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopyCode = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCodeCopied(true);

      // Clear any existing timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      // Reset the icon back to copy after 3 seconds
      copyTimeoutRef.current = setTimeout(() => {
        setCodeCopied(false);
      }, 3000);

      if (Platform.OS === 'android') {
        ToastAndroid.show('Queue code copied', ToastAndroid.SHORT);
      } else {
        Alert.alert('Copied', 'Queue code copied to clipboard.');
      }
    } catch (error) {
      console.warn('Failed to copy queue code', error);
      Alert.alert('Copy failed', 'Unable to copy the queue code. Try again.');
    }
  }, [code]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleGeneratePoster = useCallback(
    async (mode: 'color' | 'bw', forDownload: boolean = true) => {
      if (posterModeLoading) {
        return null;
      }
      setPosterModeLoading(mode);
      setPosterGenerating(true);
      try {
        if (!isWeb) {
          setPosterBlackWhite(mode === 'bw');
          const uri = await posterNativeRef.current?.capture();
          if (uri) {
            const normalized = uri.startsWith('file://') ? uri : `file://${uri}`;
            setPosterImageUrl(normalized);
            setPosterModalVisible(true);
          } else {
            Alert.alert('Poster unavailable', 'Unable to render poster on this device.');
          }
          return null;
        }

        const doc = (globalThis as any)?.document;
        if (!doc) {
          Alert.alert('Unavailable', 'Poster downloads are only available in a web browser.');
          return null;
        }

        const blob = await generatePosterImage({
          slug: code,
          joinUrl: qrCodeLink ?? undefined,
          detailLines: buildPosterDetails(),
          blackWhiteMode: mode === 'bw',
        });

        if (forDownload) {
          const objectUrl = URL.createObjectURL(blob);
          const link = doc.createElement('a');
          link.href = objectUrl;
          const suffix = mode === 'bw' ? 'poster-bw' : 'poster';
          link.download = `queue-${code}-${suffix}.png`;
          doc.body.appendChild(link);
          link.click();
          doc.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
          Alert.alert('Poster ready', 'Check your downloads folder for the PNG file.');
          trackHostAction('qr_saved', {
            platform: Platform.OS,
            method: 'poster_download',
            mode,
          });
        } else {
          // For display in modal
          const objectUrl = URL.createObjectURL(blob);
          setPosterImageUrl(objectUrl);
        }

        return blob;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate poster';
        Alert.alert('Poster failed', message);
        return null;
      } finally {
        setPosterModeLoading(null);
        setPosterGenerating(false);
      }
    },
    [buildPosterDetails, canGeneratePoster, code, posterModeLoading, qrCodeLink, trackHostAction]
  );

  const handleShare = useCallback(async () => {
    if (!shareableLink) {
      return;
    }
    try {
      const shareMessage = displayEventName
        ? `Join this queue: ${displayEventName}\n\n${shareableLink}`
        : `Join this queue: ${code}\n\n${shareableLink}`;
      const result = await Share.share({
        message: shareMessage,
        url: shareableLink,
      });
      if (result.action === Share.sharedAction) {
        trackHostAction('qr_shared', {
          platform: Platform.OS,
          method: 'native_share',
        });
      }
    } catch (error) {
      console.warn('Failed to share queue link', error);
    }
  }, [shareableLink, displayEventName, code, trackHostAction]);

  const handleViewQrCode = useCallback(async () => {
    if (isWeb) {
      // Web: use canvas-based poster generation
      if (!canGeneratePoster) {
        Alert.alert('Try on web', 'Poster viewing is only available in a web browser.');
        return;
      }
      setPosterModalVisible(true);
      setPosterImageUrl(null);
      // Generate poster in current B&W mode
      await handleGeneratePoster(posterBlackWhite ? 'bw' : 'color', false);
    } else {
      setPosterModalVisible(true);
      setPosterImageUrl(null);
      await handleGeneratePoster(posterBlackWhite ? 'bw' : 'color', false);
    }
  }, [isWeb, canGeneratePoster, handleGeneratePoster, posterBlackWhite]);

  const handleCloseNativeQrModal = useCallback(() => {
    setNativeQrModalVisible(false);
  }, []);

  const handleSaveQrCode = useCallback(async () => {
    if (savingQr || !qrCodeRef.current) return;

    setSavingQr(true);
    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to save photos to your gallery.');
        setSavingQr(false);
        return;
      }

      // Get the QR code as base64 data
      qrCodeRef.current.toDataURL(async (dataUrl: string) => {
        try {
          const filename = `queueup-${code}-qr.png`;
          const file = new File(Paths.cache, filename);

          // Decode base64 and write to file
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          await file.write(bytes);

          // Save to media library
          const asset = await MediaLibrary.createAssetAsync(file.uri);
          await MediaLibrary.createAlbumAsync('QueueUp', asset, false);

          if (Platform.OS === 'android') {
            ToastAndroid.show('QR code saved to gallery', ToastAndroid.SHORT);
          } else {
            Alert.alert('Saved', 'QR code saved to your photo library.');
          }

          trackHostAction('qr_saved', { platform: Platform.OS, method: 'native_save' });
        } catch (error) {
          console.error('Failed to save QR code:', error);
          Alert.alert('Save failed', 'Unable to save QR code. Please try again.');
        } finally {
          setSavingQr(false);
        }
      });
    } catch (error) {
      console.error('Failed to save QR code:', error);
      Alert.alert('Save failed', 'Unable to save QR code. Please try again.');
      setSavingQr(false);
    }
  }, [savingQr, code, trackHostAction]);

  const handleClosePosterModal = useCallback(() => {
    setPosterModalVisible(false);
    if (posterImageUrl && isWeb) {
      URL.revokeObjectURL(posterImageUrl);
    }
    setPosterImageUrl(null);
  }, [posterImageUrl]);

  const handleDownloadPoster = useCallback(async () => {
    if (!posterImageUrl || !canGeneratePoster) {
      return;
    }
    if (!isWeb) {
      try {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          Alert.alert('Share unavailable', 'Sharing is not available on this device.');
          return;
        }
        await Sharing.shareAsync(posterImageUrl, {
          mimeType: 'image/png',
          dialogTitle: 'Share queue poster',
        });
        trackHostAction('qr_saved', {
          platform: Platform.OS,
          method: 'poster_share',
          mode: posterBlackWhite ? 'bw' : 'color',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to share poster';
        Alert.alert('Share failed', message);
      }
      return;
    }
    const doc = (globalThis as any)?.document;
    if (!doc) {
      return;
    }
    try {
      const response = await fetch(posterImageUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = doc.createElement('a');
      link.href = objectUrl;
      const suffix = posterBlackWhite ? 'poster-bw' : 'poster';
      link.download = `queue-${code}-${suffix}.png`;
      doc.body.appendChild(link);
      link.click();
      doc.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      Alert.alert('Poster ready', 'Check your downloads folder for the PNG file.');
      trackHostAction('qr_saved', {
        platform: Platform.OS,
        method: 'poster_download',
        mode: posterBlackWhite ? 'bw' : 'color',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download poster';
      Alert.alert('Download failed', message);
    }
  }, [posterImageUrl, canGeneratePoster, posterBlackWhite, code, trackHostAction]);

  const handleToggleBlackWhite = useCallback(async () => {
    const newMode = !posterBlackWhite;
    setPosterBlackWhite(newMode);
    // Regenerate poster with new mode
    await handleGeneratePoster(newMode ? 'bw' : 'color', false);
  }, [posterBlackWhite, handleGeneratePoster]);

  const performCloseQueue = useCallback(async () => {
    if (!hasHostAuth || closeLoading) {
      return;
    }
    setCloseLoading(true);
    try {
      await closeQueueHost({ code, hostAuthToken: hostToken }); // Optional - backend will verify ownership via session
      setClosed(true);
      setQueue([]);
      setNowServing(null);
      setConnectionError(null);
      trackHostAction('host_close_queue', {
        queueLengthBeforeClose: queue.length,
        nowServing: nowServing?.id ?? null,
      });
      try {
        // Remove this queue from persistent storage so HomeScreen won't show it anymore
        await storage.removeQueue(code);
        // Invalidate cache so next fetch from server won't include closed queues
        storage.invalidateCache();
      } catch (err) {
        console.warn('Failed to remove queue from storage after close', err);
      }
      try {
        // Also remove stored host auth for this session
        if (sessionId) {
          await storage.removeHostAuth(sessionId);
        }
      } catch (err) {
        console.warn('Failed to remove host auth from storage after close', err);
      }
      // Navigate to HomeScreen with a modal message
      navigation.replace('HomeScreen', {
        showModal: {
          title: 'Queue Closed',
          message: 'Your queue has been successfully closed.',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to close queue';
      Alert.alert('Unable to close queue', message);
    } finally {
      setCloseLoading(false);
    }
  }, [
    closeLoading,
    code,
    hasHostAuth,
    hostToken,
    navigation,
    nowServing?.id,
    queue.length,
    sessionId,
    trackHostAction,
  ]);

  const handleCloseQueue = useCallback(() => {
    if (!hasHostAuth || closeLoading) {
      return;
    }
    if (Platform.OS === 'web') {
      setCloseConfirmVisibleWeb(true);
      return;
    }
    Alert.alert(
      'Close Queue',
      'Guests will no longer be able to join once closed. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close Queue', style: 'destructive', onPress: () => void performCloseQueue() },
      ],
      { cancelable: true }
    );
  }, [closeLoading, hasHostAuth, performCloseQueue]);

  const confirmCloseQueueWeb = useCallback(() => {
    setCloseConfirmVisibleWeb(false);
    void performCloseQueue();
  }, [performCloseQueue]);

  const cancelCloseQueueWeb = useCallback(() => {
    setCloseConfirmVisibleWeb(false);
    trackHostAction('host_close_queue_cancelled');
  }, [trackHostAction]);

  const handleCloseConnectionErrorModal = useCallback(() => {
    setConnectionErrorModalVisible(false);
  }, []);

  const handleGoHome = useCallback(() => {
    setConnectionErrorModalVisible(false);
    clearReconnectTimeout();
    stopPolling();
    navigation.replace('HomeScreen');
  }, [clearReconnectTimeout, stopPolling, navigation]);

  const handleRetryConnection = useCallback(() => {
    setConnectionErrorModalVisible(false);
    setConnectionError(null);
    // Retry polling
    poll();
  }, [poll]);

  // Only force-auth hosts back home when the queue requires authentication
  useEffect(() => {
    if (!requiresAuth) return;
    if (!isAuthLoading && !isAuthenticated) {
      navigation.replace('HomeScreen');
    }
  }, [requiresAuth, isAuthLoading, isAuthenticated, navigation]);

  const renderQueueList = () => {
    if (queueCount === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {closed ? 'Queue closed.' : 'Queue is empty. Guests will appear here as they join.'}
          </Text>
        </View>
      );
    }

    return queue.map((party, index) => {
      const isLast = index === queueCount - 1;
      return (
        <View key={party.id} style={[styles.queueItem, isLast ? styles.queueItemLast : undefined]}>
          <Text style={styles.queueItemName}>
            {party.name?.trim() || 'Guest'} {party.size ? `(${party.size})` : ''}
          </Text>
          <Text style={styles.queueItemMeta}>
            Status: {party.status === 'waiting' ? 'Waiting' : 'Called'} ·{' '}
            {party.nearby ? 'Nearby' : 'Not nearby'}
          </Text>
          <Pressable
            style={styles.queueItemButton}
            onPress={() => advanceSpecific(party.id)}
            disabled={!hasHostAuth || actionLoading || closed}>
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.queueItemButtonText}>Call This Party</Text>
            )}
          </Pressable>
        </View>
      );
    });
  };

  const content = (
    <>
      <View style={styles.headerCard}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Host Console</Text>
          <Text style={[styles.statusBadge, closed ? styles.statusClosed : styles.statusActive]}>
            {closed ? 'Closed' : 'Active'}
          </Text>
        </View>
        {displayEventName ? (
          <Text style={styles.headerEvent} numberOfLines={2} ellipsizeMode="tail">
            {displayEventName}
          </Text>
        ) : null}
        {typeof capacity === 'number' ? (
          <Text style={styles.headerLine}>Guest capacity: {capacity}</Text>
        ) : null}
        {scheduleLine ? <Text style={styles.headerLine}>{scheduleLine}</Text> : null}
        <View style={styles.headerCodeRow}>
          <Text style={styles.headerLine}>Queue code:</Text>
          <Text style={styles.headerCodeValue}>{code}</Text>
          <Pressable
            style={styles.headerCopyButton}
            onPress={handleCopyCode}
            accessibilityRole="button"
            accessibilityLabel="Copy queue code to clipboard">
            {codeCopied ? (
              <Feather name="check" color="#222" size={14} />
            ) : (
              <Feather name="copy" color="#222" size={14} />
            )}
          </Pressable>
        </View>
        {/* <Text style={styles.headerLine}>Session ID: {sessionId}</Text>
        {shareableLink ? (
          <Text style={styles.headerLine} numberOfLines={1} ellipsizeMode="middle">
            Guest link: {shareableLink}
          </Text>
        ) : null} */}
        {!hasHostAuth ? (
          <Text style={styles.connectionText}>
            Host authentication token missing. Create a queue on this device to control it.
          </Text>
        ) : null}
        {shareableLink ? (
          <View style={styles.posterButtons}>
            <Pressable
              style={[
                styles.posterButton,
                posterGenerating ? styles.posterButtonDisabled : undefined,
              ]}
              onPress={handleViewQrCode}
              disabled={posterGenerating}>
              {posterGenerating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.posterButtonText}>View QR Code</Text>
              )}
            </Pressable>
            <Pressable style={styles.posterButtonSecondary} onPress={handleShare}>
              <Feather name="share-2" size={18} color="#111" />
              <Text style={styles.posterButtonSecondaryText}>Share</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.nowServingCard}>
        <Text style={styles.nowServingHeading}>Now Serving</Text>
        <Text style={styles.nowServingValue}>
          {nowServing
            ? `${nowServing.name?.trim() || 'Anonymous Guest'}${
                nowServing.size ? ` (${nowServing.size})` : ''
              }`
            : 'No party currently called.'}
        </Text>
        {nowServing ? (
          <View style={styles.timerRow}>
            <Timer targetTimestamp={callDeadline ?? null} label="Time left" compact />
          </View>
        ) : null}
        <View style={styles.queueActionsRow}>
          <Pressable
            style={[
              styles.primaryButton,
              disabledAdvance ? styles.primaryButtonDisabled : undefined,
            ]}
            disabled={disabledAdvance}
            onPress={advanceCurrent}>
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {nowServing ? 'Mark Served & Call Next' : 'Call First Party'}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.destructiveButton}
            disabled={disabledClose}
            onPress={handleCloseQueue}>
            {closeLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Close Queue</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.queueCard}>
        <View style={styles.queueList}>{renderQueueList()}</View>
      </View>
    </>
  );

  const webCloseModal = isWeb ? (
    <Modal
      visible={closeConfirmVisibleWeb}
      transparent
      animationType="fade"
      onRequestClose={cancelCloseQueueWeb}>
      <View style={styles.webModalBackdrop}>
        <View style={styles.webModalCard}>
          <Text style={styles.webModalTitle}>Close Queue</Text>
          <Text style={styles.webModalMessage}>
            Guests will no longer be able to join once closed. Proceed?
          </Text>
          <View style={styles.webModalActions}>
            <Pressable style={styles.webModalCancelButton} onPress={cancelCloseQueueWeb}>
              <Text style={styles.webModalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.webModalConfirmButton,
                closeLoading ? styles.webModalConfirmButtonDisabled : undefined,
              ]}
              onPress={confirmCloseQueueWeb}
              disabled={closeLoading}>
              {closeLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.webModalConfirmText}>Close Queue</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  const posterModal = (
    <Modal
      visible={posterModalVisible}
      transparent
      animationType="fade"
      onRequestClose={handleClosePosterModal}>
      <View style={styles.posterModalBackdrop}>
        <View style={styles.posterModalCard}>
          <View style={styles.posterModalHeader}>
            <Text style={styles.posterModalTitle}>QR Code</Text>
            <Pressable onPress={handleClosePosterModal} style={styles.posterModalCloseButton}>
              <Feather name="x" size={24} color="#111" />
            </Pressable>
          </View>
          {posterGenerating ? (
            <View style={styles.posterModalLoading}>
              <ActivityIndicator size="large" color="#111" />
              <Text style={styles.posterModalLoadingText}>Generating poster...</Text>
            </View>
          ) : posterImageUrl ? (
            <>
              <ScrollView
                style={styles.posterModalImageContainer}
                contentContainerStyle={styles.posterModalImageContent}
                maximumZoomScale={3}
                minimumZoomScale={0.5}>
                <View style={styles.posterModalImageWrapper}>
                  <Image
                    source={{ uri: posterImageUrl }}
                    style={styles.posterModalImage}
                    resizeMode="contain"
                  />
                </View>
              </ScrollView>
              <View style={styles.posterModalControls}>
                <Pressable
                  style={styles.posterModalCheckboxContainer}
                  onPress={handleToggleBlackWhite}>
                  <View
                    style={[
                      styles.posterModalCheckbox,
                      posterBlackWhite ? styles.posterModalCheckboxChecked : undefined,
                    ]}>
                    {posterBlackWhite && <Feather name="check" size={16} color="#fff" />}
                  </View>
                  <Text style={styles.posterModalCheckboxLabel}>Black & White</Text>
                </Pressable>
                <Pressable style={styles.posterModalDownloadButton} onPress={handleDownloadPoster}>
                  <Feather name="download" size={18} color="#fff" />
                  <Text style={styles.posterModalDownloadText}>Download</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  const connectionErrorModal = (
    <Modal
      visible={connectionErrorModalVisible}
      transparent
      animationType="fade"
      onRequestClose={handleCloseConnectionErrorModal}>
      <View style={styles.webModalBackdrop}>
        <View style={styles.webModalCard}>
          <Text style={styles.webModalTitle}>Connection Error</Text>
          <Text style={styles.webModalMessage}>
            {connectionError ||
              'Unable to connect to the server. Please check your internet connection and try again.'}
          </Text>
          <View style={styles.webModalActions}>
            <Pressable style={styles.webModalCancelButton} onPress={handleGoHome}>
              <Text style={styles.webModalCancelText}>Go Home</Text>
            </Pressable>
            <Pressable style={styles.webModalConfirmButton} onPress={handleRetryConnection}>
              <Text style={styles.webModalConfirmText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Native QR code modal (for iOS/Android)
  const nativeQrModal = !isWeb ? (
    <Modal
      visible={nativeQrModalVisible}
      transparent
      animationType="fade"
      onRequestClose={handleCloseNativeQrModal}>
      <View style={styles.posterModalBackdrop}>
        <View style={styles.posterModalCard}>
          <View style={styles.posterModalHeader}>
            <Text style={styles.posterModalTitle}>QR Code</Text>
            <Pressable onPress={handleCloseNativeQrModal} style={styles.posterModalCloseButton}>
              <Feather name="x" size={24} color="#111" />
            </Pressable>
          </View>
          <View style={styles.nativeQrContainer}>
            {qrCodeLink ? (
              <QRCode
                value={qrCodeLink}
                size={220}
                backgroundColor="#fff"
                color="#000"
                getRef={(ref: any) => (qrCodeRef.current = ref)}
              />
            ) : null}
            <Text style={styles.nativeQrCode}>{code}</Text>
            {displayEventName ? (
              <Text style={styles.nativeQrEventName} numberOfLines={2}>
                {displayEventName}
              </Text>
            ) : null}
            <Text style={styles.nativeQrHint}>Guests can scan this code to join your queue</Text>
          </View>
          <View style={styles.nativeQrActions}>
            <Pressable
              style={[styles.nativeQrSaveButton, savingQr && styles.posterButtonDisabled]}
              onPress={handleSaveQrCode}
              disabled={savingQr}>
              {savingQr ? (
                <ActivityIndicator color="#111" size="small" />
              ) : (
                <>
                  <Feather name="download" size={18} color="#111" />
                  <Text style={styles.nativeQrSaveText}>Save</Text>
                </>
              )}
            </Pressable>
            <Pressable style={styles.nativeQrShareButton} onPress={handleShare}>
              <Feather name="share-2" size={18} color="#fff" />
              <Text style={styles.posterModalDownloadText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

  const posterNativeHidden = !isWeb ? (
    <View
      style={{
        position: 'absolute',
        opacity: 0.01,
        width: 1080,
        height: 1920,
        left: -2000,
        top: -2000,
        pointerEvents: 'none',
      }}>
      <PosterNative
        ref={posterNativeRef}
        joinUrl={qrCodeLink ?? shareableLink}
        slug={code}
        detailLines={buildPosterDetails()}
        blackWhite={posterBlackWhite}
      />
    </View>
  ) : null;

  const renderDesktopQueueList = () => {
    if (queueCount === 0) {
      return (
        <View style={styles.desktopEmptyState}>
          {closed ? (
            <Lock style={styles.desktopEmptyStateIcon as never} size={56} strokeWidth={2.2} />
          ) : (
            <Users style={styles.desktopEmptyStateIcon as never} size={56} strokeWidth={2.2} />
          )}
          <Text style={styles.desktopEmptyStateText}>
            {closed
              ? 'Queue has been closed.'
              : 'Queue is empty. Guests will appear here as they join.'}
          </Text>
        </View>
      );
    }

    return queue.map((party, index) => {
      const isLast = index === queueCount - 1;
      return (
        <View
          key={party.id}
          style={[styles.desktopQueueItem, isLast ? styles.desktopQueueItemLast : undefined]}>
          <View style={styles.desktopQueueItemPosition}>
            <Text style={styles.desktopQueueItemPositionText}>{index + 1}</Text>
          </View>
          <View style={styles.desktopQueueItemInfo}>
            <Text style={styles.queueItemName}>
              {party.name?.trim() || 'Anonymous Guest'} {party.size ? `(${party.size})` : ''}
            </Text>
            <Text style={styles.queueItemMeta}>
              {party.status === 'waiting' ? 'Waiting' : 'Called'} ·{' '}
              {party.nearby ? 'Nearby' : 'Not nearby'}
            </Text>
          </View>
          <Pressable
            style={styles.queueItemButton}
            onPress={() => advanceSpecific(party.id)}
            disabled={!hasHostAuth || actionLoading || closed}>
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.queueItemButtonText}>Call</Text>
            )}
          </Pressable>
        </View>
      );
    });
  };

  const renderControlsPanel = () => (
    <View style={styles.desktopStickyControls}>
      <View style={styles.headerCard}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Host Console</Text>
          <Text style={[styles.statusBadge, closed ? styles.statusClosed : styles.statusActive]}>
            {closed ? 'Closed' : 'Active'}
          </Text>
        </View>
        {displayEventName ? (
          <Text style={styles.headerEvent} numberOfLines={2} ellipsizeMode="tail">
            {displayEventName}
          </Text>
        ) : null}
        {typeof capacity === 'number' ? (
          <Text style={styles.headerLine}>Guest capacity: {capacity}</Text>
        ) : null}
        {scheduleLine ? <Text style={styles.headerLine}>{scheduleLine}</Text> : null}
        <View style={styles.headerCodeRow}>
          <Text style={styles.headerLine}>Queue code:</Text>
          <Text style={styles.headerCodeValue}>{code}</Text>
          <Pressable
            style={styles.headerCopyButton}
            onPress={handleCopyCode}
            accessibilityRole="button"
            accessibilityLabel="Copy queue code to clipboard">
            {codeCopied ? (
              <Feather name="check" color="#222" size={14} />
            ) : (
              <Feather name="copy" color="#222" size={14} />
            )}
          </Pressable>
        </View>
        {!hasHostAuth ? (
          <Text style={styles.connectionText}>
            Host authentication token missing. Create a queue on this device to control it.
          </Text>
        ) : null}
        {shareableLink ? (
          <View style={styles.posterButtons}>
            <Pressable
              style={[
                styles.posterButton,
                posterGenerating ? styles.posterButtonDisabled : undefined,
              ]}
              onPress={handleViewQrCode}
              disabled={posterGenerating}>
              {posterGenerating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.posterButtonText}>View QR Code</Text>
              )}
            </Pressable>
            <Pressable style={styles.posterButtonSecondary} onPress={handleShare}>
              <Feather name="share-2" size={18} color="#111" />
              <Text style={styles.posterButtonSecondaryText}>Share</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.nowServingCard}>
        <Text style={styles.nowServingHeading}>Now Serving</Text>
        <Text style={styles.nowServingValue}>
          {nowServing
            ? `${nowServing.name?.trim() || 'Guest'}${
                nowServing.size ? ` (${nowServing.size})` : ''
              }`
            : 'No party currently called.'}
        </Text>
        {nowServing ? (
          <View style={styles.timerRow}>
            <Timer targetTimestamp={callDeadline ?? null} label="Time left" compact />
          </View>
        ) : null}
        <View style={styles.queueActionsRow}>
          <Pressable
            style={[
              styles.primaryButton,
              disabledAdvance ? styles.primaryButtonDisabled : undefined,
            ]}
            disabled={disabledAdvance}
            onPress={advanceCurrent}>
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {nowServing ? 'Mark Served & Call Next' : 'Call First Party'}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.destructiveButton}
            disabled={disabledClose}
            onPress={handleCloseQueue}>
            {closeLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Close Queue</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderQueuePanel = () => (
    <View style={styles.desktopQueueCard}>
      <View style={styles.desktopQueueHeader}>
        <Text style={styles.desktopQueueTitle}>Queue</Text>
        <Text style={styles.desktopQueueCount}>
          {queueCount} {queueCount === 1 ? 'party' : 'parties'}
        </Text>
      </View>
      <ScrollView style={styles.desktopQueueList} contentContainerStyle={{ flexGrow: 1 }}>
        {renderDesktopQueueList()}
      </ScrollView>
    </View>
  );

  const modals = (
    <>
      {posterNativeHidden}
      {webCloseModal}
      {posterModal}
      {connectionErrorModal}
      {nativeQrModal}
    </>
  );

  // Desktop layout
  if (isDesktop) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.desktopContainer}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled">
          {/* Left column - Controls */}
          <View style={styles.desktopControlsColumn}>{renderControlsPanel()}</View>

          {/* Right column - Queue */}
          <View style={styles.desktopQueueColumn}>{renderQueuePanel()}</View>
        </ScrollView>
        {modals}
      </SafeAreaProvider>
    );
  }

  // Show loading state while recovering params from storage or waiting for auth
  if (isRecoveringParams || isAuthLoading) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1f6feb" />
          <Text style={{ marginTop: 16, color: '#586069' }}>Loading queue...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Mobile layout
  return (
    <SafeAreaProvider style={styles.safe}>
      <ScrollView
        style={styles.mobileScroll}
        contentContainerStyle={styles.containerContent}
        keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>
      {modals}
    </SafeAreaProvider>
  );
}
