import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  useNavigationContainerRef,
  useNavigation,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {
  Pressable,
  StyleSheet,
  Platform,
  Image,
  View,
  ActivityIndicator,
  Text,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, LogOut, User, BarChart3 } from 'lucide-react-native';
import './global.css';

import HomeScreen from './components/Home/HomeScreen';
import MakeQueueScreen from './components/Make/MakeQueueScreen';
import JoinQueueScreen from './components/Join/JoinQueueScreen';
import HostQueueScreen from './components/Host/HostQueueScreen';
import GuestQueueScreen from './components/Guest/GuestQueueScreen';
import PrivacyPolicyScreen from './components/PrivacyPolicy/PrivacyPolicyScreen';
import AdminDashboardScreen from './components/Admin/AdminDashboardScreen';
import HostDashboardScreen from './components/HostDashboard/HostDashboardScreen';
import LoginScreen from './components/Login/LoginScreen';
import type { RootStackParamList } from './types/navigation';
import { ModalProvider } from './contexts/ModalContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdProvider, useAd } from './contexts/AdContext';
import React, { useState } from 'react';
import AdBanner from './components/Ads/AdBanner';
// import AdPopup from './components/Ads/AdPopup';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Linking configuration for deep links and web URLs (web only)
const linking =
  Platform.OS === 'web'
    ? {
        prefixes: ['queueup://', 'https://queueup.app', 'http://localhost:8081'],
        config: {
          screens: {
            HomeScreen: '',
            LoginScreen: 'login',
            MakeQueueScreen: 'make',
            JoinQueueScreen: 'join/:code?',
            // Only use the code in the URL path - sensitive params are passed via
            // navigation state and recovered from storage on page refresh
            GuestQueueScreen: {
              path: 'queue/:code',
              parse: {
                code: (code: string) => code,
              },
              stringify: {
                code: (code: string) => code,
                // Exclude sensitive params from URL
                partyId: () => undefined as unknown as string,
                sessionId: () => undefined as unknown as string,
                initialPosition: () => undefined as unknown as string,
                initialAheadCount: () => undefined as unknown as string,
                initialQueueLength: () => undefined as unknown as string,
                initialEtaMs: () => undefined as unknown as string,
                guestName: () => undefined as unknown as string,
                partySize: () => undefined as unknown as string,
              },
            },
            HostQueueScreen: {
              path: 'host/:code',
              parse: {
                code: (code: string) => code,
              },
              stringify: {
                code: (code: string) => code,
                // Exclude sensitive params from URL
                sessionId: () => undefined as unknown as string,
                wsUrl: () => undefined as unknown as string,
                hostAuthToken: () => undefined as unknown as string,
                joinUrl: () => undefined as unknown as string,
                eventName: () => undefined as unknown as string,
                maxGuests: () => undefined as unknown as string,
                location: () => undefined as unknown as string,
                contactInfo: () => undefined as unknown as string,
                openTime: () => undefined as unknown as string,
                closeTime: () => undefined as unknown as string,
                requiresAuth: () => undefined as unknown as string,
              },
            },
            PrivacyPolicyScreen: 'privacy',
            AdminDashboardScreen: 'admin',
            HostDashboardScreen: 'my-queues',
          },
        },
      }
    : undefined;

const headerStyles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  loginButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarButton: {
    padding: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#cfd1d4',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#cfd1d4',
    backgroundColor: '#e5e5e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: 8,
  },
  backButtonSpacer: {
    // Same width as backButton to keep header layout consistent
    width: 38, // 22 (icon) + 8 (padding) + 8 (marginLeft)
    marginLeft: 8,
  },
  // Dropdown menu styles
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuContainer: {
    marginTop: Platform.OS === 'web' ? 60 : 100,
    marginRight: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  menuHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  menuEmail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  menuItemDestructive: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  menuItemText: {
    fontSize: 15,
    color: '#111',
  },
  menuItemTextDestructive: {
    color: '#dc2626',
  },
});

const getScreenTitle = (screenName: string): string => {
  const screenTitles: Record<string, string> = {
    HomeScreen: 'Home',
    LoginScreen: 'Login',
    MakeQueueScreen: 'Make Queue',
    JoinQueueScreen: 'Join Queue',
    HostQueueScreen: 'Host Queue',
    GuestQueueScreen: 'Guest Queue',
    PrivacyPolicyScreen: 'Privacy Policy',
    AdminDashboardScreen: 'Analytics',
    HostDashboardScreen: 'My Queues',
  };
  return screenTitles[screenName] || screenName;
};

function HeaderRight() {
  const { user, isLoading, isAdmin, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [menuVisible, setMenuVisible] = useState(false);

  if (isLoading) {
    return (
      <View style={headerStyles.headerRight}>
        <ActivityIndicator size="small" color="#666" />
      </View>
    );
  }

  if (user) {
    // Email is the primary identifier, fall back to name/username
    const displayName =
      user.email || user.google_email || user.google_name || user.github_username || 'User';
    const avatarUrl = user.github_avatar_url || user.google_avatar_url;

    return (
      <View style={headerStyles.headerRight}>
        <Pressable
          style={headerStyles.avatarButton}
          accessibilityRole="button"
          accessibilityLabel="Open user menu"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => setMenuVisible(true)}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={headerStyles.avatar}
              accessibilityLabel={`${displayName}'s avatar`}
            />
          ) : (
            <View style={headerStyles.avatarPlaceholder}>
              <User size={20} color="#666" />
            </View>
          )}
        </Pressable>

        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}>
          <Pressable style={headerStyles.menuOverlay} onPress={() => setMenuVisible(false)}>
            <Pressable style={headerStyles.menuContainer} onPress={(e) => e.stopPropagation()}>
              {/* User info header */}
              <View style={headerStyles.menuHeader}>
                <Text style={headerStyles.menuUsername}>{displayName}</Text>
              </View>

              {/* My Queues button */}
              <Pressable
                style={headerStyles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  navigation.navigate('HostDashboardScreen');
                }}
                accessibilityRole="button"
                accessibilityLabel="My Queues">
                <User size={18} color="#111" />
                <Text style={headerStyles.menuItemText}>My Queues</Text>
              </Pressable>

              {/* Analytics Dashboard - Admin only */}
              {isAdmin && (
                <Pressable
                  style={headerStyles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    navigation.navigate('AdminDashboardScreen');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Analytics Dashboard">
                  <BarChart3 size={18} color="#111" />
                  <Text style={headerStyles.menuItemText}>Analytics Dashboard</Text>
                </Pressable>
              )}

              {/* Logout button */}
              <Pressable
                style={[headerStyles.menuItem, headerStyles.menuItemDestructive]}
                onPress={async () => {
                  setMenuVisible(false);
                  await logout();
                  navigation.navigate('HomeScreen');
                }}
                accessibilityRole="button"
                accessibilityLabel="Log out">
                <LogOut size={18} color="#dc2626" />
                <Text style={[headerStyles.menuItemText, headerStyles.menuItemTextDestructive]}>
                  Log out
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // Not logged in - show Login button
  return (
    <View style={headerStyles.headerRight}>
      <Pressable
        style={headerStyles.loginButton}
        accessibilityRole="button"
        accessibilityLabel="Log in"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => navigation.navigate('LoginScreen')}>
        <Text style={headerStyles.loginButtonText}>Login</Text>
      </Pressable>
    </View>
  );
}

function AppNavigator() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  // const { showPopup, closePopup } = useAd();

  // Only use documentTitle on web
  const documentTitleConfig =
    Platform.OS === 'web'
      ? {
          formatter: (_options: unknown, route: { name?: string } | undefined) =>
            `QueueUp - ${getScreenTitle(route?.name ?? 'HomeScreen')}`,
        }
      : undefined;

  return (
    <NavigationContainer ref={navigationRef} linking={linking} documentTitle={documentTitleConfig}>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        <Stack.Navigator
          initialRouteName="HomeScreen"
          screenOptions={({ navigation, route }) => {
            const isNative = Platform.OS !== 'web';
            const isHomeScreen = route.name === 'HomeScreen';

            // For HostQueueScreen, we need custom back behavior to go to HomeScreen
            const isHostQueueScreen = route.name === 'HostQueueScreen';

            // Base options for all screens
            const baseOptions = {
              headerRight: () => <HeaderRight />,
              headerTitle: '',
              headerTintColor: '#111',
              // This sets what the NEXT screen's back button will say
              headerBackTitle: 'Back',
            };

            // Native platforms: use native back button with proper animations
            if (isNative) {
              // HomeScreen: no back button
              if (isHomeScreen) {
                return {
                  ...baseOptions,
                  headerBackVisible: false,
                  headerLeft: () => <View style={headerStyles.backButtonSpacer} />,
                };
              }

              // All other screens: use native back button
              return {
                ...baseOptions,
                headerBackVisible: true,
              };
            }

            // Web: custom back button for all non-home screens
            if (isHomeScreen) {
              return {
                ...baseOptions,
                headerLeft: () => <View style={headerStyles.backButtonSpacer} />,
              };
            }

            const handleBack = () => {
              if (isHostQueueScreen) {
                navigation.navigate('HomeScreen');
              } else if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('HomeScreen');
              }
            };

            return {
              ...baseOptions,
              headerLeft: () => (
                <Pressable
                  style={headerStyles.backButton}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={handleBack}>
                  <ArrowLeft size={22} color="#111" strokeWidth={2.5} />
                </Pressable>
              ),
            };
          }}>
          <Stack.Screen
            name="HomeScreen"
            component={HomeScreen}
            options={{ headerBackTitle: 'Home' }}
          />
          <Stack.Screen
            name="LoginScreen"
            component={LoginScreen}
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="MakeQueueScreen"
            component={MakeQueueScreen}
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="JoinQueueScreen"
            component={JoinQueueScreen}
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="GuestQueueScreen"
            component={GuestQueueScreen}
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="HostQueueScreen"
            component={HostQueueScreen}
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="PrivacyPolicyScreen"
            component={PrivacyPolicyScreen}
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="AdminDashboardScreen"
            component={AdminDashboardScreen}
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="HostDashboardScreen"
            component={HostDashboardScreen}
            options={{ headerBackTitle: 'Back' }}
          />
        </Stack.Navigator>
        {Platform.OS === 'web' ? (
          <AdBanner variant="banner" />
        ) : (
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff' }}>
            <AdBanner variant="banner" />
          </SafeAreaView>
        )}
        {/* <AdPopup visible={showPopup} onClose={closePopup} /> */}
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ModalProvider>
        <AdProvider>
          <AppNavigator />
        </AdProvider>
      </ModalProvider>
    </AuthProvider>
  );
}
