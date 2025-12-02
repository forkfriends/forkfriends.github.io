import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, Platform } from 'react-native';
import Constants from 'expo-constants';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Dynamic import types for react-native-google-mobile-ads
type InterstitialAdModule = {
  InterstitialAd: {
    createForAdRequest: (
      adUnitId: string,
      requestOptions?: { requestNonPersonalizedAdsOnly?: boolean }
    ) => {
      load: () => void;
      show: () => Promise<void>;
      addAdEventListener: (event: string, callback: (error?: any) => void) => () => void;
    };
  };
  AdEventType: {
    LOADED: string;
    ERROR: string;
    CLOSED: string;
  };
  TestIds: {
    INTERSTITIAL: string;
  };
};

export default function AdPopup({ visible, onClose }: Props) {
  const isExpoGo = Constants.appOwnership === 'expo';
  const [adModule, setAdModule] = useState<InterstitialAdModule | null>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  // Load the ad module on mount (native only)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isExpoGo) return;

    let cancelled = false;

    (async () => {
      try {
        const mod = await import('react-native-google-mobile-ads');
        if (cancelled) return;
        setAdModule(mod as unknown as InterstitialAdModule);
      } catch (err) {
        console.warn('[AdPopup] react-native-google-mobile-ads unavailable', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // When visible becomes true, load and show interstitial
  useEffect(() => {
    if (!visible) {
      setAdLoaded(false);
      setShowFallback(false);
      return;
    }

    // Web or Expo Go: show fallback immediately
    if (Platform.OS === 'web' || isExpoGo || !adModule) {
      setShowFallback(true);
      return;
    }

    const { InterstitialAd, AdEventType, TestIds } = adModule;
    const adUnitId = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID || TestIds.INTERSTITIAL;

    const interstitial = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    // Set up a timeout fallback in case ad doesn't load
    const fallbackTimer = setTimeout(() => {
      if (!adLoaded) {
        setShowFallback(true);
      }
    }, 5000);

    const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      clearTimeout(fallbackTimer);
      setAdLoaded(true);
      interstitial.show().catch((err) => {
        console.warn('[AdPopup] Failed to show interstitial', err);
        setShowFallback(true);
      });
    });

    const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
      clearTimeout(fallbackTimer);
      console.warn('[AdPopup] Interstitial error', error);
      setShowFallback(true);
    });

    const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      onClose();
    });

    // Start loading the ad
    interstitial.load();

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribeLoaded();
      unsubscribeError();
      unsubscribeClosed();
    };
  }, [visible, adModule, isExpoGo, onClose]);

  // If we're showing native interstitial (successfully loaded), render nothing
  // The interstitial takes over the full screen
  if (Platform.OS !== 'web' && !isExpoGo && adModule && adLoaded && !showFallback) {
    return null;
  }

  // Fallback modal for web, Expo Go, or when native ad fails
  return (
    <Modal
      visible={visible && showFallback}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Pressable
          onPress={onClose}
          style={{
            alignSelf: 'center',
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 8,
            backgroundColor: '#111',
            marginBottom: 12,
          }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
        </Pressable>
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 4,
            height: '80%',
          }}>
          <View
            style={{
              height: '100%',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              backgroundColor: '#f8fafc',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              overflow: 'hidden',
            }}>
            <Text style={{ color: '#4b5563', fontSize: 14, marginBottom: 6 }}>
              {Platform.OS === 'web'
                ? 'Ad placeholder (web)'
                : isExpoGo
                  ? 'Ads need a dev/production build'
                  : 'Ad placeholder'}
            </Text>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>320 x 250</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
