import React from 'react';
import { View, Text, Image, Pressable, Platform, useWindowDimensions } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import type { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import styles from './LoginScreen.Styles';

type Props = NativeStackScreenProps<RootStackParamList, 'LoginScreen'>;

export default function LoginScreen({ navigation }: Props) {
  const { login, isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  // If already authenticated, go back
  React.useEffect(() => {
    if (isAuthenticated) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('HomeScreen');
      }
    }
  }, [isAuthenticated, navigation]);

  const handleGitHubLogin = async () => {
    await login('github');
  };

  const handleGoogleLogin = async () => {
    await login('google');
  };

  // Render provider buttons (shared between desktop and mobile)
  const renderProviderButtons = (useDesktopStyles = false) => (
    <View style={useDesktopStyles ? styles.desktopProvidersContainer : styles.providersContainer}>
      <Pressable
        style={[
          useDesktopStyles ? styles.desktopProviderButton : styles.providerButton,
          styles.githubButton,
        ]}
        onPress={handleGitHubLogin}
        accessibilityRole="button"
        accessibilityLabel="Sign in with GitHub">
        <FontAwesome name="github" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={[styles.providerText, styles.githubText]}>Continue with GitHub</Text>
      </Pressable>

      <Pressable
        style={[
          useDesktopStyles ? styles.desktopProviderButton : styles.providerButton,
          styles.googleButton,
        ]}
        onPress={handleGoogleLogin}
        accessibilityRole="button"
        accessibilityLabel="Sign in with Google">
        <Svg width={20} height={20} viewBox="0 0 48 48" style={{ marginRight: 8 }}>
          <Path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.7 1.22 9.17 3.6l6.82-6.82C35.8 2.64 30.6 0 24 0 14.64 0 6.58 5.74 2.56 14.06l7.96 6.19C12.43 13.14 17.74 9.5 24 9.5z"
          />
          <Path
            fill="#4285F4"
            d="M46.1 24.55c0-1.58-.14-3.11-.41-4.59H24v8.7h12.35c-.53 2.88-2.1 5.32-4.47 6.98l6.85 5.32C42.94 36.63 46.1 31.1 46.1 24.55z"
          />
          <Path
            fill="#FBBC05"
            d="M10.52 28.25c-.48-1.43-.75-2.95-.75-4.5s.27-3.07.75-4.5l-7.96-6.19C.92 15.74 0 19.29 0 23.75s.92 8.01 2.56 11.69l7.96-6.19z"
          />
          <Path
            fill="#34A853"
            d="M24 47.5c6.6 0 12.12-2.17 16.16-5.92l-6.85-5.32c-1.9 1.28-4.33 2.06-7.31 2.06-6.26 0-11.57-3.64-13.48-8.75l-7.96 6.19C6.58 42.26 14.64 47.5 24 47.5z"
          />
        </Svg>
        <Text style={[styles.providerText, styles.googleText]}>Continue with Google</Text>
      </Pressable>
    </View>
  );

  // Desktop layout
  if (isDesktop) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.desktopContainer}>
          {/* Left: Branding */}
          <View style={styles.desktopBrandingColumn}>
            <View style={styles.desktopBrandingContent}>
              {Platform.OS === 'web' ? (
                <Image
                  source={{ uri: '/icon-black.svg' }}
                  style={styles.desktopBrandingLogo}
                  resizeMode="contain"
                />
              ) : (
                <Image
                  source={require('@assets/icon-black.png')}
                  style={styles.desktopBrandingLogo}
                  resizeMode="contain"
                />
              )}
              <Text style={styles.desktopBrandingTitle}>QueueUp</Text>
              <Text style={styles.desktopBrandingTagline}>
                The simplest way to manage queues and keep your guests happy.
              </Text>

              <View style={styles.desktopFeatureList}>
                <View style={styles.desktopFeatureItem}>
                  <View style={styles.desktopFeatureIcon}>
                    <Check size={14} color="#fff" />
                  </View>
                  <Text style={styles.desktopFeatureText}>Real-time queue updates</Text>
                </View>
                <View style={styles.desktopFeatureItem}>
                  <View style={styles.desktopFeatureIcon}>
                    <Check size={14} color="#fff" />
                  </View>
                  <Text style={styles.desktopFeatureText}>Browser push notifications</Text>
                </View>
                <View style={styles.desktopFeatureItem}>
                  <View style={styles.desktopFeatureIcon}>
                    <Check size={14} color="#fff" />
                  </View>
                  <Text style={styles.desktopFeatureText}>Easy QR code sharing</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right: Login form */}
          <View style={styles.desktopFormColumn}>
            <View style={styles.desktopFormCard}>
              <Text style={styles.desktopFormTitle}>Welcome back</Text>
              <Text style={styles.desktopFormSubtitle}>Sign in to manage your queues</Text>
              {renderProviderButtons(true)}
            </View>
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  // Mobile layout
  return (
    <SafeAreaProvider style={styles.safe}>
      <View style={styles.container}>
        {/* Logo and Title */}
        <View style={styles.logoContainer}>
          {Platform.OS === 'web' ? (
            <Image
              source={{ uri: '/icon-black.svg' }}
              style={styles.logoIcon}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={require('@assets/icon-black.png')}
              style={styles.logoIcon}
              resizeMode="contain"
            />
          )}
          <Text style={styles.title}>QueueUp</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        {/* Provider Buttons */}
        {renderProviderButtons(false)}
      </View>
    </SafeAreaProvider>
  );
}
