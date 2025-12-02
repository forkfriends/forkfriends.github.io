import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Constants from 'expo-constants';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

type Props = {
  adUnitId?: string;
  variant?: 'banner' | 'square' | 'vertical';
};

export default function AdBanner({ adUnitId, variant = 'banner' }: Props) {
  const isExpoGo = Constants.appOwnership === 'expo';
  const [adReady, setAdReady] = useState<boolean | null>(isExpoGo ? false : null);
  const [adError, setAdError] = useState(false);

  useEffect(() => {
    if (isExpoGo) return;
    // Module is already imported, mark as ready
    setAdReady(true);
  }, [isExpoGo]);

  // Expo Go cannot host the native AdMob module; show a soft placeholder instead.
  if (isExpoGo) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <PlaceholderCard />
        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          Ads need a dev/production build
        </Text>
      </View>
    );
  }

  if (adReady === null) {
    // Still probing availability; keep layout stable
    return (
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Loading ad…</Text>
      </View>
    );
  }

  if (adReady === false || adError) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <PlaceholderCard />
      </View>
    );
  }

  const resolvedUnitId = adUnitId || process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || TestIds.BANNER;

  // Map variant to BannerAdSize
  const getBannerSize = () => {
    switch (variant) {
      case 'square':
        return BannerAdSize.MEDIUM_RECTANGLE; // 300x250
      case 'vertical':
        return BannerAdSize.LARGE_BANNER; // 320x100
      default:
        return BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
    }
  };

  return (
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      <BannerAd
        unitId={resolvedUnitId}
        size={getBannerSize()}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          console.log('[AdBanner] Ad loaded');
        }}
        onAdFailedToLoad={(error: any) => {
          console.warn('[AdBanner] Failed to load ad', error);
          setAdError(true);
        }}
      />
    </View>
  );
}

function PlaceholderCard() {
  return (
    <View
      style={{
        height: 50,
        width: 320,
        maxWidth: '100%',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#eef2ff',
        borderColor: '#c7d2fe',
        borderWidth: 1,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: 12, color: '#4b5563' }}>Ad placeholder</Text>
    </View>
  );
}
