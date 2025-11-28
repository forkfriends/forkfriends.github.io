import React, { useEffect } from 'react';
import { Platform, View, Text } from 'react-native';
import { AdMobBanner, setTestDeviceIDAsync } from 'expo-ads-admob';

type Props = {
  adUnitId?: string;
};

const TEST_BANNER_ID = 'ca-app-pub-3659178074995037~5469095890';

export default function AdBanner({ adUnitId }: Props) {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void setTestDeviceIDAsync('EMULATOR');
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 320,
            height: 50,
            borderRadius: 8,
            backgroundColor: '#f4f4f5',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {/* AdMob is native-only; show a placeholder on web builds */}
          <AdmobPlaceholder />
        </View>
      </View>
    );
  }

  const resolvedUnitId = adUnitId || process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || TEST_BANNER_ID;

  return (
    <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
      <AdMobBanner
        bannerSize="smartBannerPortrait"
        adUnitID={resolvedUnitId}
        servePersonalizedAds={false}
        onDidFailToReceiveAdWithError={(error) => {
          // Avoid native alerts; log for debugging
          console.warn('[AdBanner] Failed to load ad', error);
        }}
      />
    </View>
  );
}

// Small placeholder component to avoid ad network code on web
function AdmobPlaceholder() {
  return (
    <View>
      <Text
        style={{
          fontSize: 12,
          color: '#6b7280',
        }}>
        Ads shown on mobile builds
      </Text>
    </View>
  );
}
