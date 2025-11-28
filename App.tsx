import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Linking,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Github, LogOut, User } from 'lucide-react-native';
import './global.css';

import HomeScreen from './components/Home/HomeScreen';
import MakeQueueScreen from './components/Make/MakeQueueScreen';
import JoinQueueScreen from './components/Join/JoinQueueScreen';
import HostQueueScreen from './components/Host/HostQueueScreen';
import GuestQueueScreen from './components/Guest/GuestQueueScreen';
import PrivacyPolicyScreen from './components/PrivacyPolicy/PrivacyPolicyScreen';
import AdminDashboardScreen from './components/Admin/AdminDashboardScreen';
import LoginScreen from './components/Login/LoginScreen';
import type { RootStackParamList } from './types/navigation';
import { ModalProvider } from './contexts/ModalContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

type ScreenName = keyof RootStackParamList;

type ScreenState = {
  name: ScreenName;
  params?: unknown;
};

function getScreenTitle(screenName: ScreenName): string {
  const screenTitles: Record<ScreenName, string> = {
    HomeScreen: 'Home',
    LoginScreen: 'Login',
    MakeQueueScreen: 'Make Queue',
    JoinQueueScreen: 'Join Queue',
    HostQueueScreen: 'Host Queue',
    GuestQueueScreen: 'Guest Queue',
    PrivacyPolicyScreen: 'Privacy Policy',
    AdminDashboardScreen: 'Analytics',
  };
  return screenTitles[screenName] ?? screenName;
}

const GITHUB_URL = 'https://github.com/forkfriends/queueup';

type HeaderRightProps = {
  navigation: {
    navigate: (name: ScreenName, params?: unknown) => void;
  };
};

function HeaderRight({ navigation }: HeaderRightProps) {
  const { user, isLoading, logout } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.headerRight}>
        <ActivityIndicator size="small" color="#666" />
      </View>
    );
  }

  if (user) {
    const displayName =
      user.email || user.google_email || user.google_name || user.github_username || 'User';
    const avatarUrl = user.github_avatar_url || user.google_avatar_url;

    return (
      <View style={styles.headerRight}>
        <Pressable
          style={styles.avatarButton}
          accessibilityRole="button"
          accessibilityLabel="Open user menu"
          hitSlop={8}
          onPress={() => setMenuVisible(true)}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              accessibilityLabel={`${displayName}'s avatar`}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <User size={20} color="#666" />
            </View>
          )}
        </Pressable>

        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}>
          <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
            <Pressable style={styles.menuContainer} onPress={(e) => e.stopPropagation()}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuUsername}>{displayName}</Text>
              </View>
              <Pressable
                style={[styles.menuItem, styles.menuItemDestructive]}
                onPress={async () => {
                  setMenuVisible(false);
                  await logout();
                }}
                accessibilityRole="button"
                accessibilityLabel="Log out">
                <LogOut size={18} color="#dc2626" />
                <Text style={[styles.menuItemText, styles.menuItemTextDestructive]}>Log out</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.headerRight}>
      <Pressable
        style={styles.loginButton}
        accessibilityRole="button"
        accessibilityLabel="Log in"
        hitSlop={8}
        onPress={() => navigation.navigate('LoginScreen')}>
        <Text style={styles.loginButtonText}>Login</Text>
      </Pressable>
      <Pressable
        style={[styles.iconButton, { marginLeft: 8 }]}
        accessibilityRole="link"
        accessibilityLabel="View ForkFriends on GitHub"
        hitSlop={12}
        onPress={() => {
          void Linking.openURL(GITHUB_URL);
        }}>
        <Github size={22} color="#111" strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function AppInner() {
  const [stack, setStack] = useState<ScreenState[]>([{ name: 'HomeScreen' }]);
  const focusListenersRef = useRef<Record<number, Set<() => void>>>({});
  const prevIndexRef = useRef(0);

  const currentIndex = stack.length - 1;
  const current = stack[currentIndex];

  const navigation: any = {
    navigate: (name: ScreenName, params?: unknown) => {
      setStack((prev) => [...prev, { name, params }]);
    },
    replace: (name: ScreenName, params?: unknown) => {
      setStack((prev) => {
        if (!prev.length) return [{ name, params }];
        const next = [...prev];
        next[next.length - 1] = { name, params };
        return next;
      });
    },
    goBack: () => {
      setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    },
    canGoBack: () => stack.length > 1,
    addListener: (type: string, listener: () => void) => {
      if (type !== 'focus') {
        return () => {};
      }
      const key = currentIndex;
      const store = focusListenersRef.current;
      let set = store[key];
      if (!set) {
        set = new Set();
        store[key] = set;
      }
      set.add(listener);
      return () => {
        const existing = store[key];
        existing?.delete(listener);
      };
    },
    setOptions: () => {},
  };

  const route: any = {
    key: current.name,
    name: current.name,
    params: current.params,
  };

  useEffect(() => {
    if (prevIndexRef.current === currentIndex) {
      return;
    }
    const listeners = focusListenersRef.current[currentIndex];
    listeners?.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Focus listener error', error);
      }
    });
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const screenTitle = getScreenTitle(current.name);
    document.title = `QueueUp - ${screenTitle}`;
  }, [current.name]);

  const renderCurrentScreen = () => {
    switch (current.name) {
      case 'HomeScreen':
        return <HomeScreen navigation={navigation} route={route} />;
      case 'LoginScreen':
        return <LoginScreen navigation={navigation} route={route} />;
      case 'MakeQueueScreen':
        return <MakeQueueScreen navigation={navigation} route={route} />;
      case 'JoinQueueScreen':
        return <JoinQueueScreen navigation={navigation} route={route} />;
      case 'HostQueueScreen':
        return <HostQueueScreen navigation={navigation} route={route} />;
      case 'GuestQueueScreen':
        return <GuestQueueScreen navigation={navigation} route={route} />;
      case 'PrivacyPolicyScreen':
        return <PrivacyPolicyScreen navigation={navigation} route={route} />;
      case 'AdminDashboardScreen':
        return <AdminDashboardScreen navigation={navigation} route={route} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeRoot} edges={['top', 'left', 'right']}>
        <StatusBar style="auto" />
        <View style={styles.header}>
          {current.name !== 'HomeScreen' && stack.length > 1 ? (
            <Pressable
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={() => navigation.goBack()}>
              <ArrowLeft size={22} color="#111" strokeWidth={2.5} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <HeaderRight navigation={navigation} />
        </View>
        <View style={styles.content}>{renderCurrentScreen()}</View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ModalProvider>
        <AppInner />
      </ModalProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cfd1d4',
    backgroundColor: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  backButton: {
    padding: 8,
    marginLeft: 4,
  },
  content: {
    flex: 1,
  },
  iconButton: {
    padding: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cfd1d4',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
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
