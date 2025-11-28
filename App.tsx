import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View, Pressable, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import './global.css';

import HomeScreen from './components/Home/HomeScreen';
import MakeQueueScreen from './components/Make/MakeQueueScreen';
import JoinQueueScreen from './components/Join/JoinQueueScreen';
import HostQueueScreen from './components/Host/HostQueueScreen';
import GuestQueueScreen from './components/Guest/GuestQueueScreen';
import type { RootStackParamList } from './types/navigation';
import { ModalProvider } from './contexts/ModalContext';
import { Github, ArrowLeft } from 'lucide-react-native';

type ScreenName = keyof RootStackParamList;

type ScreenState = {
  name: ScreenName;
  params?: unknown;
};

function getScreenTitle(screenName: ScreenName): string {
  const screenTitles: Record<ScreenName, string> = {
    HomeScreen: 'Home',
    MakeQueueScreen: 'Make Queue',
    JoinQueueScreen: 'Join Queue',
    HostQueueScreen: 'Host Queue',
    GuestQueueScreen: 'Guest Queue',
  };
  return screenTitles[screenName] ?? screenName;
}

const GITHUB_URL = 'https://github.com/forkfriends/queueup';

export default function App() {
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
      case 'MakeQueueScreen':
        return <MakeQueueScreen navigation={navigation} route={route} />;
      case 'JoinQueueScreen':
        return <JoinQueueScreen navigation={navigation} route={route} />;
      case 'HostQueueScreen':
        return <HostQueueScreen navigation={navigation} route={route} />;
      case 'GuestQueueScreen':
        return <GuestQueueScreen navigation={navigation} route={route} />;
      default:
        return null;
    }
  };

  return (
    <ModalProvider>
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
            <View style={styles.headerRight}>
              <Pressable
                style={styles.iconButton}
                accessibilityRole="link"
                accessibilityLabel="View ForkFriends on GitHub"
                hitSlop={12}
                onPress={() => {
                  void Linking.openURL(GITHUB_URL);
                }}>
                <Github size={22} color="#111" strokeWidth={2} />
              </Pressable>
            </View>
          </View>
          <View style={styles.content}>{renderCurrentScreen()}</View>
        </SafeAreaView>
      </SafeAreaProvider>
    </ModalProvider>
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
  backButton: {
    padding: 8,
    marginLeft: 4,
  },
  content: {
    flex: 1,
  },
});
