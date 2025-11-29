import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import type { RootStackParamList } from '../../types/navigation';
import { getMyQueues, buildHostWsUrlFromCode, type MyQueue } from '../../lib/backend';
import { useAuth } from '../../contexts/AuthContext';
import { storage } from '../../utils/storage';
import styles from './HostDashboardScreen.Styles';

type Props = NativeStackScreenProps<RootStackParamList, 'HostDashboardScreen'>;

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000); // DB timestamp is in seconds
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '-';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export default function HostDashboardScreen({ navigation }: Props) {
  const { user, isLoading: authLoading, login } = useAuth();
  const [queues, setQueues] = useState<MyQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const fetchQueues = useCallback(async () => {
    try {
      setError(null);
      const result = await getMyQueues();
      setQueues(result.queues);
    } catch (err) {
      if (err instanceof Error) {
        if (
          err.message.includes('Authentication required') ||
          err.message.includes('Invalid session')
        ) {
          setError('Please log in to view your queues');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to load queues');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setLoading(true);
      void fetchQueues();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading, fetchQueues]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchQueues();
  }, [fetchQueues]);

  const handleQueuePress = useCallback(
    async (queue: MyQueue) => {
      // Build the WebSocket URL from the queue code
      const wsUrl = buildHostWsUrlFromCode(queue.shortCode);
      const joinUrl =
        typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/queue/${queue.shortCode}`
          : undefined;

      // Try to get the stored host auth token
      try {
        let hostAuth = await storage.getHostAuth(queue.id);
        if (!hostAuth) {
          hostAuth = await storage.getHostAuthByCode(queue.shortCode);
        }
        if (hostAuth) {
          // Navigate to host queue screen
          navigation.navigate('HostQueueScreen', {
            code: queue.shortCode,
            sessionId: queue.id,
            wsUrl,
            hostAuthToken: hostAuth,
            joinUrl,
            eventName: queue.eventName ?? undefined,
            maxGuests: queue.maxGuests ?? undefined,
            location: queue.location,
            contactInfo: queue.contactInfo,
            openTime: queue.openTime,
            closeTime: queue.closeTime,
            requiresAuth: queue.requiresAuth ?? false,
          });
          return;
        }
      } catch (err) {
        console.warn('Failed to get host auth', err);
      }

      // If no stored auth, show an error or redirect
      // For now, we'll still navigate but without the token
      navigation.navigate('HostQueueScreen', {
        code: queue.shortCode,
        sessionId: queue.id,
        wsUrl,
        joinUrl,
        eventName: queue.eventName ?? undefined,
        maxGuests: queue.maxGuests ?? undefined,
        location: queue.location,
        contactInfo: queue.contactInfo,
        openTime: queue.openTime,
        closeTime: queue.closeTime,
        requiresAuth: queue.requiresAuth ?? false,
      });
    },
    [navigation]
  );

  // Show loading while checking auth
  if (authLoading) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Checking authentication...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.title}>My Queues</Text>
          <Text style={styles.loadingText}>Please log in to view and manage your queues</Text>
          <Pressable
            style={styles.loginButton}
            onPress={() => login('github', { returnTo: '/my-queues' })}>
            <Text style={styles.loginButtonText}>Log in with GitHub</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  if (loading) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Loading your queues...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.title}>My Queues</Text>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
          <Pressable style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  if (queues.length === 0) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={isDesktop ? styles.desktopEmptyContainer : styles.emptyContainer}>
          <Text style={isDesktop ? styles.desktopEmptyTitle : styles.title}>My Queues</Text>
          <Text style={isDesktop ? styles.desktopEmptyText : styles.emptyText}>
            You have not created any queues yet. Create your first queue to start managing guests.
          </Text>
          <Pressable
            style={isDesktop ? styles.desktopCreateButton : styles.createButton}
            onPress={() => navigation.navigate('MakeQueueScreen', undefined)}>
            {isDesktop && <Plus size={18} color="#fff" />}
            <Text style={isDesktop ? styles.desktopCreateButtonText : styles.createButtonText}>
              Create Your First Queue
            </Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  // Render a queue card (shared between desktop and mobile)
  const renderQueueCard = (queue: MyQueue, useDesktopStyles = false) => (
    <Pressable
      key={queue.id}
      style={({ pressed }) => [
        useDesktopStyles ? styles.desktopQueueCard : styles.queueCard,
        pressed && (useDesktopStyles ? styles.desktopQueueCardPressed : styles.queueCardPressed),
      ]}
      onPress={() => handleQueuePress(queue)}>
      <View style={useDesktopStyles ? styles.desktopQueueHeader : styles.queueHeader}>
        <Text
          style={useDesktopStyles ? styles.desktopQueueName : styles.queueName}
          numberOfLines={1}>
          {queue.eventName || 'Unnamed Queue'}
        </Text>
        <View
          style={[
            useDesktopStyles ? styles.desktopStatusBadge : styles.statusBadge,
            queue.status === 'active' ? styles.statusActive : styles.statusClosed,
          ]}>
          <Text
            style={[
              styles.statusText,
              queue.status === 'active' ? styles.statusTextActive : styles.statusTextClosed,
            ]}>
            {queue.status === 'active' ? 'Active' : 'Closed'}
          </Text>
        </View>
      </View>

      <Text style={styles.queueCode}>Code: {queue.shortCode}</Text>

      <View style={useDesktopStyles ? styles.desktopStatsRow : styles.statsRow}>
        <View style={useDesktopStyles ? styles.desktopStatItem : styles.statItem}>
          <Text style={useDesktopStyles ? styles.desktopStatValue : styles.statValue}>
            {queue.stats.activeCount}
          </Text>
          <Text style={useDesktopStyles ? styles.desktopStatLabel : styles.statLabel}>
            In Queue
          </Text>
        </View>
        <View style={useDesktopStyles ? styles.desktopStatItem : styles.statItem}>
          <Text style={useDesktopStyles ? styles.desktopStatValue : styles.statValue}>
            {queue.stats.servedCount}
          </Text>
          <Text style={useDesktopStyles ? styles.desktopStatLabel : styles.statLabel}>Served</Text>
        </View>
        <View style={useDesktopStyles ? styles.desktopStatItem : styles.statItem}>
          <Text style={useDesktopStyles ? styles.desktopStatValue : styles.statValue}>
            {queue.stats.leftCount}
          </Text>
          <Text style={useDesktopStyles ? styles.desktopStatLabel : styles.statLabel}>Left</Text>
        </View>
        <View style={useDesktopStyles ? styles.desktopStatItem : styles.statItem}>
          <Text style={useDesktopStyles ? styles.desktopStatValue : styles.statValue}>
            {formatDuration(queue.stats.avgWaitSeconds)}
          </Text>
          <Text style={useDesktopStyles ? styles.desktopStatLabel : styles.statLabel}>
            Avg Wait
          </Text>
        </View>
      </View>

      <View style={useDesktopStyles ? styles.desktopQueueMeta : styles.queueMeta}>
        <Text style={styles.queueDate}>Created {formatDate(queue.createdAt)}</Text>
        {queue.requiresAuth && (
          <View style={styles.authBadge}>
            <Text style={styles.authBadgeText}>Login Required</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  // Desktop layout
  if (isDesktop) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.desktopScrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
          <View style={styles.desktopHeader}>
            <View style={styles.desktopTitleGroup}>
              <Text style={styles.desktopTitle}>My Queues</Text>
              <Text style={styles.desktopSubtitle}>
                {queues.length} {queues.length === 1 ? 'queue' : 'queues'}
              </Text>
            </View>
            <Pressable
              style={styles.desktopCreateButton}
              onPress={() => navigation.navigate('MakeQueueScreen', undefined)}>
              <Plus size={18} color="#fff" />
              <Text style={styles.desktopCreateButtonText}>Create Queue</Text>
            </Pressable>
          </View>

          <View style={styles.desktopQueueGrid}>
            {queues.map((queue) => renderQueueCard(queue, true))}
          </View>
        </ScrollView>
      </SafeAreaProvider>
    );
  }

  // Mobile layout
  return (
    <SafeAreaProvider style={styles.safe}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <Text style={styles.title}>My Queues</Text>
        <Text style={styles.subtitle}>
          {queues.length} {queues.length === 1 ? 'queue' : 'queues'}
        </Text>

        {queues.map((queue) => renderQueueCard(queue, false))}
      </ScrollView>
    </SafeAreaProvider>
  );
}
