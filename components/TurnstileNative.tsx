import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { API_BASE_URL } from '../lib/backend';

interface TurnstileNativeProps {
  onSuccess: (token: string) => void;
  onError?: (error: string) => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

export interface TurnstileNativeHandle {
  reset: () => void;
}

type TurnstileMessage =
  | { type: 'success'; token: string }
  | { type: 'error'; error: string }
  | { type: 'expire' }
  | { type: 'ready' }
  | { type: 'log'; message: string };

const TurnstileNative = forwardRef<TurnstileNativeHandle, TurnstileNativeProps>(
  function TurnstileNative({ onSuccess, onError, onExpire, theme = 'light' }, ref) {
    const webViewRef = useRef<WebView>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Key to force WebView remount on reset
    const [resetKey, setResetKey] = useState(0);

    // Expose reset method via ref
    useImperativeHandle(ref, () => ({
      reset: () => {
        console.log('[TurnstileNative] Resetting widget');
        setIsLoading(true);
        setError(null);
        // Increment key to force WebView remount
        setResetKey((k) => k + 1);
      },
    }));

    // Build URL to hosted Turnstile page on the API domain
    // Site key is configured server-side for security
    const turnstileUrl = useMemo(() => {
      const url = new URL('/turnstile', API_BASE_URL);
      url.searchParams.set('theme', theme);
      return url.toString();
    }, [theme]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const data: TurnstileMessage = JSON.parse(event.nativeEvent.data);

          switch (data.type) {
            case 'success':
              console.log('[TurnstileNative] Token received');
              onSuccess(data.token);
              break;
            case 'error':
              console.error('[TurnstileNative] Error:', data.error);
              setError(data.error);
              onError?.(data.error);
              break;
            case 'expire':
              console.warn('[TurnstileNative] Token expired');
              onExpire?.();
              break;
            case 'ready':
              console.log('[TurnstileNative] Widget ready');
              setIsLoading(false);
              break;
            case 'log':
              console.log('[TurnstileNative]', data.message);
              break;
          }
        } catch (e) {
          console.error('[TurnstileNative] Failed to parse message:', e);
        }
      },
      [onSuccess, onError, onExpire]
    );

    if (error) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorText}>Verification unavailable</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#1f6feb" />
            <Text style={styles.loadingText}>Loading verification...</Text>
          </View>
        )}
        <WebView
          key={resetKey}
          ref={webViewRef}
          source={{ uri: turnstileUrl }}
          style={[styles.webview, isLoading && styles.webviewHidden]}
          scrollEnabled={false}
          bounces={false}
          originWhitelist={['*']}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[TurnstileNative] WebView error:', nativeEvent);
            setError('Failed to load verification');
            onError?.('WebView error');
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[TurnstileNative] HTTP error:', nativeEvent.statusCode);
          }}
        />
      </View>
    );
  }
);

export default TurnstileNative;

const styles = StyleSheet.create({
  container: {
    width: 300,
    height: 65,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    width: 300,
    height: 65,
    backgroundColor: 'transparent',
  },
  webviewHidden: {
    opacity: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    zIndex: 1,
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
  errorSubtext: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});
