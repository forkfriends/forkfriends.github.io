import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, Platform, useWindowDimensions } from 'react-native';
import { storage } from '../../utils/storage';
import type { StoredQueue, StoredJoinedQueue } from '../../utils/storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import styles from './HomeScreen.Styles';

type Props = NativeStackScreenProps<RootStackParamList, 'HomeScreen'>;

const DESKTOP_BREAKPOINT = 900;

export default function HomeScreen({ navigation }: Props) {
  const { user, isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const handledPrefillRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [activeQueues, setActiveQueues] = React.useState<StoredQueue[]>([]);

  const [joinedQueues, setJoinedQueues] = React.useState<StoredJoinedQueue[]>([]);

  // Check for active queue on mount and when returning to screen
  const checkForQueues = React.useCallback(async () => {
    try {
      const [storedQueues, storedJoinedQueues] = await Promise.all([
        storage.getActiveQueues(isAuthenticated),
        storage.getJoinedQueues(isAuthenticated),
      ]);

      console.log(
        'Checking for stored queues:',
        storedQueues.length ? `Found ${storedQueues.length} hosted` : 'No hosted queues',
        storedJoinedQueues.length ? `, ${storedJoinedQueues.length} joined` : ', no joined queues'
      );

      // Sort queues by creation time, newest first
      setActiveQueues(storedQueues.sort((a, b) => b.createdAt - a.createdAt));
      setJoinedQueues(storedJoinedQueues.sort((a, b) => b.joinedAt - a.joinedAt));
    } catch (error) {
      console.error('Error checking for queues:', error);
      setActiveQueues([]);
      setJoinedQueues([]);
    }
  }, [isAuthenticated]);

  // Load queues only once on mount
  React.useEffect(() => {
    if (!initialLoadDoneRef.current) {
      void checkForQueues();
      initialLoadDoneRef.current = true;
    }
  }, [checkForQueues]);

  // Reload queues when authentication state changes (e.g., after login)
  React.useEffect(() => {
    if (initialLoadDoneRef.current) {
      // Force refresh to get server data when auth state changes
      storage.invalidateCache();
      void checkForQueues();
    }
  }, [isAuthenticated, checkForQueues]);

  // Only reload queues when returning from GuestQueueScreen if storage has changed
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Check if the stored queues have changed
      const checkStoredQueues = async () => {
        try {
          const storedJoinedQueues = await storage.getJoinedQueues(isAuthenticated);
          const currentCodes = new Set(joinedQueues.map((q) => q.code));
          const storedCodes = new Set(storedJoinedQueues.map((q) => q.code));

          // Only reload if the stored queues are different from our current state
          if (
            storedCodes.size !== currentCodes.size ||
            storedJoinedQueues.some((q) => !currentCodes.has(q.code)) ||
            joinedQueues.some((q) => !storedCodes.has(q.code))
          ) {
            void checkForQueues();
          }
        } catch (error) {
          console.warn('Error checking stored queues:', error);
        }
      };

      void checkStoredQueues();
    });

    return unsubscribe;
  }, [navigation, checkForQueues, joinedQueues, isAuthenticated]);

  useEffect(() => {
    if (handledPrefillRef.current) {
      return;
    }
    if (Platform.OS !== 'web') {
      return;
    }
    const search = window.location.search;
    if (!search) {
      return;
    }
    const params = new URLSearchParams(search);
    const joinCode = params.get('code');
    if (!joinCode) {
      return;
    }
    const normalized = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      return;
    }
    handledPrefillRef.current = true;
    navigation.navigate('JoinQueueScreen', { id: 'link', code: normalized });
    const cleanedUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanedUrl);
  }, [navigation]);

  const hasQueues = joinedQueues.length > 0 || activeQueues.length > 0;

  // Desktop layout: two columns
  if (isDesktop) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.desktopContainer}>
          {/* Left: Hero section */}
          <View style={styles.heroSection}>
            <View style={[styles.titleContainer, styles.titleContainerDesktop]}>
              <Image
                source={{ uri: '/icon-black.svg' }}
                style={[styles.logoIcon, styles.logoIconDesktop]}
                resizeMode="contain"
              />
              <Text style={[styles.title, styles.titleDesktop]}>QueueUp</Text>
              <Text style={styles.tagline}>
                Simple, real-time queue management for pop-ups, restaurants, and events.
              </Text>
            </View>

            <View style={[styles.buttonRow, styles.buttonRowDesktop]}>
              <Pressable
                style={[styles.button, styles.buttonDesktop]}
                onPress={() => navigation.navigate('MakeQueueScreen', { id: 'new' })}>
                <Text style={styles.buttonText}>Make Queue</Text>
              </Pressable>

              <Pressable
                style={[styles.button, styles.buttonDesktop]}
                onPress={() => navigation.navigate('JoinQueueScreen', { id: 'new' })}>
                <Text style={styles.buttonText}>Join Queue</Text>
              </Pressable>

              {user && (
                <Pressable
                  style={[styles.myQueuesButton, styles.myQueuesButtonDesktop]}
                  onPress={() => navigation.navigate('HostDashboardScreen')}>
                  <Text style={styles.myQueuesButtonText}>My Queues</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.footerLinks}>
              <Pressable onPress={() => navigation.navigate('PrivacyPolicyScreen')}>
                <Text style={styles.privacyLink}>Privacy Policy</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate('AdminDashboardScreen')}>
                <Text style={styles.privacyLink}>Analytics Dashboard</Text>
              </Pressable>
            </View>
          </View>

          {/* Right: Queue lists */}
          <View style={styles.queuesSection}>
            {joinedQueues.length > 0 && (
              <View style={[styles.sectionContainer, styles.sectionContainerDesktop]}>
                <Text style={styles.sectionTitle}>Joined Queues</Text>
                {joinedQueues.map((queue) => (
                  <Pressable
                    key={`joined-${queue.code}`}
                    style={styles.queueCard}
                    onPress={() => {
                      navigation.navigate('GuestQueueScreen', {
                        code: queue.code,
                        sessionId: queue.sessionId,
                        partyId: queue.partyId,
                      });
                    }}>
                    <Text style={styles.queueCardTitle}>{queue.eventName || queue.code}</Text>
                    <Text style={styles.queueCardSubtitle}>Tap to view your spot</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {activeQueues.length > 0 && (
              <View style={[styles.sectionContainer, styles.sectionContainerDesktop]}>
                <Text style={styles.sectionTitle}>Hosted Queues</Text>
                {activeQueues.map((queue) => (
                  <Pressable
                    key={`host-${queue.code}`}
                    style={styles.queueCard}
                    onPress={() => {
                      navigation.navigate('HostQueueScreen', {
                        code: queue.code,
                        sessionId: queue.sessionId,
                        wsUrl: queue.wsUrl,
                        hostAuthToken: queue.hostAuthToken,
                        joinUrl: queue.joinUrl,
                        eventName: queue.eventName,
                        maxGuests: queue.maxGuests,
                        location: queue.location,
                        contactInfo: queue.contactInfo,
                        openTime: queue.openTime,
                        closeTime: queue.closeTime,
                      });
                    }}>
                    <Text style={styles.queueCardTitle}>
                      {queue.eventName ? queue.eventName : queue.code}
                    </Text>
                    <Text style={styles.queueCardSubtitle}>Tap to manage queue</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!hasQueues && (
              <Text style={styles.emptyQueuesText}>
                Your active queues will appear here once you create or join one.
              </Text>
            )}
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  // Mobile layout: single column
  return (
    <SafeAreaProvider style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.innerContainer}>
          <View style={styles.titleContainer}>
            {Platform.OS === 'web' ? (
              <Image
                source={{
                  uri:
                    typeof window !== 'undefined' &&
                    (window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1')
                      ? '/icon-black.svg'
                      : '/icon-black.svg',
                }}
                style={styles.logoIcon}
                resizeMode="contain"
              />
            ) : (
              <Image
                source={require('@assets/ff_logo.png')}
                style={styles.logoIcon}
                resizeMode="contain"
              />
            )}
            <Text style={styles.title}>QueueUp</Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={styles.button}
              onPress={() => navigation.navigate('MakeQueueScreen', { id: 'new' })}>
              <Text style={styles.buttonText}>Make Queue</Text>
            </Pressable>

            <Pressable
              style={styles.button}
              onPress={() => navigation.navigate('JoinQueueScreen', { id: 'new' })}>
              <Text style={styles.buttonText}>Join Queue</Text>
            </Pressable>
          </View>

          {user && (
            <Pressable
              style={styles.myQueuesButton}
              onPress={() => navigation.navigate('HostDashboardScreen')}>
              <Text style={styles.myQueuesButtonText}>My Queues</Text>
            </Pressable>
          )}

          {joinedQueues.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Joined Queues</Text>
              {joinedQueues.map((queue, index) => (
                <Pressable
                  key={`joined-${queue.code}`}
                  style={[styles.button, styles.joinedButton, index > 0 && styles.buttonSpacing]}
                  onPress={() => {
                    navigation.navigate('GuestQueueScreen', {
                      code: queue.code,
                      sessionId: queue.sessionId,
                      partyId: queue.partyId,
                    });
                  }}>
                  <Text style={styles.joinedButtonText}>{queue.eventName || queue.code}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {activeQueues.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Hosted Queues</Text>
              {activeQueues.map((queue, index) => (
                <Pressable
                  key={`host-${queue.code}`}
                  style={[
                    styles.button,
                    styles.returnButton,
                    index > 0 && styles.returnButtonSpacing,
                  ]}
                  onPress={() => {
                    navigation.navigate('HostQueueScreen', {
                      code: queue.code,
                      sessionId: queue.sessionId,
                      wsUrl: queue.wsUrl,
                      hostAuthToken: queue.hostAuthToken,
                      joinUrl: queue.joinUrl,
                      eventName: queue.eventName,
                      maxGuests: queue.maxGuests,
                      location: queue.location,
                      contactInfo: queue.contactInfo,
                      openTime: queue.openTime,
                      closeTime: queue.closeTime,
                    });
                  }}>
                  <Text style={styles.buttonText}>
                    {queue.eventName ? queue.eventName : queue.code}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable onPress={() => navigation.navigate('PrivacyPolicyScreen')}>
            <Text style={styles.privacyLink}>Privacy Policy</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('AdminDashboardScreen')}>
            <Text style={styles.privacyLink}>Analytics Dashboard</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
