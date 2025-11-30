import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { storage } from '../../utils/storage';
import type { StoredQueue, StoredJoinedQueue } from '../../utils/storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../contexts/ModalContext';
import styles from './HomeScreen.Styles';

type Props = NativeStackScreenProps<RootStackParamList, 'HomeScreen'>;

const DESKTOP_BREAKPOINT = 900;

// Icon source for the logo - use PNG for native (SVG not supported), SVG for web
const logoSource =
  Platform.OS === 'web' ? { uri: '/icon-black.svg' } : require('@assets/icon-black.png');

export default function HomeScreen({ navigation, route }: Props) {
  const { user, isAuthenticated } = useAuth();
  const { showModal } = useModal();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const handledPrefillRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const handledShowModalRef = useRef(false);
  const [activeQueues, setActiveQueues] = React.useState<StoredQueue[]>([]);

  const [joinedQueues, setJoinedQueues] = React.useState<StoredJoinedQueue[]>([]);

  // Check for active queue on mount and when returning to screen
  const checkForQueues = React.useCallback(
    async (forceRefresh = false) => {
      try {
        const [storedQueues, storedJoinedQueues] = await Promise.all([
          storage.getActiveQueues(isAuthenticated, forceRefresh),
          storage.getJoinedQueues(isAuthenticated, forceRefresh),
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
    },
    [isAuthenticated]
  );

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
      void checkForQueues(true);
    }
  }, [isAuthenticated, checkForQueues]);

  // Reload queues whenever this screen regains focus
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void checkForQueues(true);
    });

    return unsubscribe;
  }, [navigation, checkForQueues]);

  useEffect(() => {
    if (handledPrefillRef.current) {
      return;
    }
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location?.origin) {
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

  // Show modal if passed via route params (e.g., after closing a queue)
  useEffect(() => {
    const modalParams = route.params?.showModal;
    if (modalParams && !handledShowModalRef.current) {
      handledShowModalRef.current = true;
      showModal({
        title: modalParams.title,
        message: modalParams.message,
      });
    }
  }, [route.params?.showModal, showModal]);

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
                source={logoSource}
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
            </View>

            <View style={styles.footerLinks}>
              <Pressable onPress={() => navigation.navigate('PrivacyPolicyScreen')}>
                <Text style={styles.privacyLink}>Privacy Policy</Text>
              </Pressable>
            </View>
          </View>

          {/* Right: Queue lists */}
          <ScrollView
            style={styles.queuesSection}
            contentContainerStyle={styles.queuesSectionContent}
            showsVerticalScrollIndicator={false}>
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
                        requiresAuth: queue.requiresAuth ?? false,
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
          </ScrollView>
        </View>
      </SafeAreaProvider>
    );
  }

  // Mobile layout: single column
  return (
    <SafeAreaProvider style={styles.safe}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.innerContainer}>
          <View style={styles.titleContainer}>
            <Image source={logoSource} style={styles.logoIcon} resizeMode="contain" />
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
                      requiresAuth: queue.requiresAuth ?? false,
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
        </View>
      </ScrollView>
    </SafeAreaProvider>
  );
}
