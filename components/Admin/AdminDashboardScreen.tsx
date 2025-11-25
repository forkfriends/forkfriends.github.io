import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { API_BASE_URL } from '../../lib/backend';
import styles from './AdminDashboardScreen.Styles';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminDashboardScreen'>;

interface AnalyticsData {
  period: {
    days: number;
    since: string;
  };
  eventCounts: Array<{ type: string; count: number }>;
  dailyEvents: Array<{ day: string; count: number }>;
  queueStats: {
    total_queues: number;
    active_queues: number;
    closed_queues: number;
  };
  partyStats: Array<{ status: string; count: number }>;
  pushStats: {
    prompts_shown: number;
    push_granted: number;
    push_denied: number;
    nudges_sent: number;
    nudges_acked: number;
  };
  joinFunnel: {
    qr_scanned: number;
    join_started: number;
    join_completed: number;
    abandoned: number;
  };
  platformBreakdown: Array<{ platform: string; count: number }>;
  hostActions: {
    queues_created: number;
    call_next: number;
    call_specific: number;
    queues_closed: number;
  };
  waitTimeStats: {
    total_served: number;
    avg_wait_ms: number | null;
    min_wait_ms: number | null;
    max_wait_ms: number | null;
  };
  abandonmentStats: {
    total_left: number;
    avg_wait_ms_at_leave: number | null;
    avg_position_at_leave: number | null;
    left_under_5min: number;
    left_5_to_15min: number;
    left_over_15min: number;
  };
  perQueueStats: Array<{
    session_id: string;
    event_name: string | null;
    short_code: string;
    total_parties: number;
    served_count: number;
    left_count: number;
    no_show_count: number;
    avg_wait_ms: number | null;
  }>;
  etaAccuracyStats: {
    total_with_eta: number;
    avg_error_ms: number | null;
    avg_bias_ms: number | null;
    within_2min: number;
    within_5min: number;
  };
  completionByWait: Array<{
    wait_bucket: string;
    total: number;
    served: number;
    left: number;
    no_show: number;
  }>;
}

const PERIOD_OPTIONS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function AdminDashboardScreen(_props: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState(7);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (days: number) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/api/analytics?days=${days}`);
      if (!response.ok) {
        throw new Error('Failed to load analytics');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchAnalytics(selectedDays);
  }, [selectedDays, fetchAnalytics]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchAnalytics(selectedDays);
  }, [selectedDays, fetchAnalytics]);

  const handleExport = useCallback(
    (exportType: 'parties' | 'events' | 'queues') => {
      const url = `${API_BASE_URL}/api/analytics/export?days=${selectedDays}&type=${exportType}`;
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        void Linking.openURL(url);
      }
    },
    [selectedDays]
  );

  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDuration = (ms: number | null | undefined): string => {
    if (ms === null || ms === undefined) return '-';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  const getPartyStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      waiting: 'Waiting',
      called: 'Called',
      served: 'Served',
      left: 'Left',
      no_show: 'No Show',
      kicked: 'Kicked',
    };
    return labels[status] || status;
  };

  const renderConversionFunnel = () => {
    const scans = data?.joinFunnel?.qr_scanned ?? 0;
    const started = data?.joinFunnel?.join_started ?? 0;
    const completed = data?.joinFunnel?.join_completed ?? 0;
    const abandoned = data?.joinFunnel?.abandoned ?? 0;

    const startRate = scans > 0 ? started / scans : 0;
    const completeRatePrev = started > 0 ? completed / started : 0;
    const abandonRatePrev = started > 0 ? abandoned / started : 0;
    const overallCompletion = scans > 0 ? completed / scans : 0;

    // Pending = started - completed - abandoned
    const pending = Math.max(started - completed - abandoned, 0);
    const notStarted = Math.max(scans - started, 0);
    const base = scans || 1;

    const segments: Array<{ key: string; value: number; style: any; label: string }> = [
      {
        key: 'not_started',
        value: notStarted,
        style: styles.segmentNotStarted,
        label: 'Not Started',
      },
      { key: 'pending', value: pending, style: styles.segmentPending, label: 'Pending' },
      { key: 'completed', value: completed, style: styles.segmentCompleted, label: 'Completed' },
      { key: 'abandoned', value: abandoned, style: styles.segmentAbandoned, label: 'Abandoned' },
    ];

    return (
      <View style={styles.conversionWrapper}>
        <Text style={styles.conversionSummary}>
          Start {Math.round(startRate * 100)}% • Complete {Math.round(completeRatePrev * 100)}% •
          Abandon {Math.round(abandonRatePrev * 100)}% • Overall{' '}
          {Math.round(overallCompletion * 100)}%
        </Text>
        <View style={styles.conversionSegmentsRow}>
          {segments.map((seg) => {
            const pct = base > 0 ? seg.value / base : 0;
            if (pct <= 0) return null;
            return (
              <View key={seg.key} style={[styles.conversionSegment, seg.style, { flex: pct }]}>
                {pct > 0.07 && (
                  <Text style={styles.conversionSegmentText}>{Math.round(pct * 100)}%</Text>
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.conversionLegendRow}>
          <View style={styles.conversionLegendItem}>
            <View style={[styles.conversionLegendSwatch, styles.segmentNotStarted]} />
            <Text style={styles.conversionLegendLabel}>
              Not Started ({formatNumber(notStarted)})
            </Text>
          </View>
          <View style={styles.conversionLegendItem}>
            <View style={[styles.conversionLegendSwatch, styles.segmentPending]} />
            <Text style={styles.conversionLegendLabel}>Pending ({formatNumber(pending)})</Text>
          </View>
          <View style={styles.conversionLegendItem}>
            <View style={[styles.conversionLegendSwatch, styles.segmentCompleted]} />
            <Text style={styles.conversionLegendLabel}>Completed ({formatNumber(completed)})</Text>
          </View>
          <View style={styles.conversionLegendItem}>
            <View style={[styles.conversionLegendSwatch, styles.segmentAbandoned]} />
            <Text style={styles.conversionLegendLabel}>Abandoned ({formatNumber(abandoned)})</Text>
          </View>
        </View>
        <Text style={styles.conversionHelp}>
          Pending = started − completed − abandoned. Not Started = scanned − started.
        </Text>
      </View>
    );
  };

  const renderDailyChart = () => {
    if (!data?.dailyEvents || data.dailyEvents.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data for this period</Text>
        </View>
      );
    }

    const maxCount = Math.max(...data.dailyEvents.map((d) => d.count), 1);
    const days = data.dailyEvents;

    return (
      <View>
        <View style={styles.chartContainer}>
          {days.map((day, index) => (
            <View
              key={day.day}
              style={[styles.chartBar, { height: `${Math.max((day.count / maxCount) * 100, 3)}%` }]}
            />
          ))}
        </View>
        <View style={styles.chartLabels}>
          <Text style={styles.chartLabel}>{days[0]?.day?.slice(5) || ''}</Text>
          <Text style={styles.chartLabel}>{days[days.length - 1]?.day?.slice(5) || ''}</Text>
        </View>
      </View>
    );
  };

  if (loading && !data) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={styles.safe}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <View style={styles.header}>
          <Text style={styles.title}>Analytics Dashboard</Text>
          <View style={styles.periodSelector}>
            {PERIOD_OPTIONS.map((option) => (
              <Pressable
                key={option.days}
                style={[
                  styles.periodButton,
                  selectedDays === option.days && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedDays(option.days)}>
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedDays === option.days && styles.periodButtonTextActive,
                  ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={handleRefresh}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {data && (
          <>
            {/* Export Buttons */}
            <View style={styles.exportSection}>
              <Text style={styles.exportTitle}>Export Data</Text>
              <View style={styles.exportButtons}>
                <Pressable style={styles.exportButton} onPress={() => handleExport('parties')}>
                  <Text style={styles.exportButtonText}>Parties CSV</Text>
                </Pressable>
                <Pressable style={styles.exportButton} onPress={() => handleExport('queues')}>
                  <Text style={styles.exportButtonText}>Queues CSV</Text>
                </Pressable>
                <Pressable style={styles.exportButton} onPress={() => handleExport('events')}>
                  <Text style={styles.exportButtonText}>Events CSV</Text>
                </Pressable>
              </View>
            </View>

            {/* Queue Overview */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Queue Overview</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.queueStats?.total_queues)}
                    </Text>
                    <Text style={styles.statLabel}>Total Queues</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.queueStats?.active_queues)}
                    </Text>
                    <Text style={styles.statLabel}>Active</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.queueStats?.closed_queues)}
                    </Text>
                    <Text style={styles.statLabel}>Closed</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Daily Activity Chart */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Daily Activity</Text>
              <View style={styles.card}>{renderDailyChart()}</View>
            </View>

            {/* Conversion Funnel */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Conversion Funnel</Text>
              <View style={styles.card}>{renderConversionFunnel()}</View>
            </View>

            {/* Push Notifications */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Push Notifications</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.pushStats?.prompts_shown)}
                    </Text>
                    <Text style={styles.statLabel}>Prompts Shown</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.pushStats?.push_granted)}
                    </Text>
                    <Text style={styles.statLabel}>Granted</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.pushStats?.push_denied)}
                    </Text>
                    <Text style={styles.statLabel}>Denied</Text>
                  </View>
                </View>
                <View style={[styles.statsGrid, { marginTop: 12 }]}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.pushStats?.nudges_sent)}
                    </Text>
                    <Text style={styles.statLabel}>Nudges Sent</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.pushStats?.nudges_acked)}
                    </Text>
                    <Text style={styles.statLabel}>Acknowledged</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {data.pushStats?.nudges_sent
                        ? `${((data.pushStats.nudges_acked / data.pushStats.nudges_sent) * 100).toFixed(0)}%`
                        : '-'}
                    </Text>
                    <Text style={styles.statLabel}>Ack Rate</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Party Outcomes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Party Outcomes</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  {data.partyStats?.map((stat) => (
                    <View key={stat.status} style={styles.statItem}>
                      <Text style={styles.statValue}>{formatNumber(stat.count)}</Text>
                      <Text style={styles.statLabel}>{getPartyStatusLabel(stat.status)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Host Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Host Actions</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.hostActions?.queues_created)}
                    </Text>
                    <Text style={styles.statLabel}>Created</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.hostActions?.call_next)}
                    </Text>
                    <Text style={styles.statLabel}>Call Next</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.hostActions?.call_specific)}
                    </Text>
                    <Text style={styles.statLabel}>Call Specific</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.hostActions?.queues_closed)}
                    </Text>
                    <Text style={styles.statLabel}>Closed</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Wait Time Stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Wait Time Analysis</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatDuration(data.waitTimeStats?.avg_wait_ms)}
                    </Text>
                    <Text style={styles.statLabel}>Avg Wait</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatDuration(data.waitTimeStats?.min_wait_ms)}
                    </Text>
                    <Text style={styles.statLabel}>Min Wait</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatDuration(data.waitTimeStats?.max_wait_ms)}
                    </Text>
                    <Text style={styles.statLabel}>Max Wait</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.waitTimeStats?.total_served)}
                    </Text>
                    <Text style={styles.statLabel}>Served</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Abandonment Analysis */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Abandonment Analysis</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.abandonmentStats?.total_left)}
                    </Text>
                    <Text style={styles.statLabel}>Total Left</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatDuration(data.abandonmentStats?.avg_wait_ms_at_leave)}
                    </Text>
                    <Text style={styles.statLabel}>Avg Wait at Leave</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {data.abandonmentStats?.avg_position_at_leave
                        ? `#${Math.round(data.abandonmentStats.avg_position_at_leave)}`
                        : '-'}
                    </Text>
                    <Text style={styles.statLabel}>Avg Position</Text>
                  </View>
                </View>
                <View style={[styles.statsGrid, { marginTop: 12 }]}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.abandonmentStats?.left_under_5min)}
                    </Text>
                    <Text style={styles.statLabel}>Left &lt;5min</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.abandonmentStats?.left_5_to_15min)}
                    </Text>
                    <Text style={styles.statLabel}>Left 5-15min</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatNumber(data.abandonmentStats?.left_over_15min)}
                    </Text>
                    <Text style={styles.statLabel}>Left &gt;15min</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Per-Queue Stats */}
            {data.perQueueStats && data.perQueueStats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Queue Performance</Text>
                <View style={styles.card}>
                  {data.perQueueStats.map((queue) => {
                    const completionRate =
                      queue.total_parties > 0
                        ? Math.round((queue.served_count / queue.total_parties) * 100)
                        : 0;
                    return (
                      <View key={queue.session_id} style={styles.queueRow}>
                        <View style={styles.queueHeader}>
                          <Text style={styles.queueName} numberOfLines={1}>
                            {queue.event_name || queue.short_code}
                          </Text>
                          <Text style={styles.queueCode}>{queue.short_code}</Text>
                        </View>
                        <View style={styles.queueStats}>
                          <Text style={styles.queueStatItem}>{queue.total_parties} joined</Text>
                          <Text style={styles.queueStatItem}>{completionRate}% served</Text>
                          <Text style={styles.queueStatItem}>
                            {formatDuration(queue.avg_wait_ms)} avg
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ETA Accuracy Stats */}
            {data.etaAccuracyStats && data.etaAccuracyStats.total_with_eta > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ETA Accuracy</Text>
                <View style={styles.card}>
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {formatDuration(
                          data.etaAccuracyStats.avg_error_ms
                            ? Math.abs(data.etaAccuracyStats.avg_error_ms)
                            : null
                        )}
                      </Text>
                      <Text style={styles.statLabel}>Avg Error</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {data.etaAccuracyStats.total_with_eta > 0
                          ? `${Math.round((data.etaAccuracyStats.within_2min / data.etaAccuracyStats.total_with_eta) * 100)}%`
                          : '-'}
                      </Text>
                      <Text style={styles.statLabel}>Within 2min</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {data.etaAccuracyStats.total_with_eta > 0
                          ? `${Math.round((data.etaAccuracyStats.within_5min / data.etaAccuracyStats.total_with_eta) * 100)}%`
                          : '-'}
                      </Text>
                      <Text style={styles.statLabel}>Within 5min</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {formatNumber(data.etaAccuracyStats.total_with_eta)}
                      </Text>
                      <Text style={styles.statLabel}>With ETA</Text>
                    </View>
                  </View>
                  {data.etaAccuracyStats.avg_bias_ms !== null && (
                    <Text style={styles.etaNote}>
                      {data.etaAccuracyStats.avg_bias_ms > 0
                        ? `Estimates are ${formatDuration(Math.abs(data.etaAccuracyStats.avg_bias_ms))} too short on average`
                        : data.etaAccuracyStats.avg_bias_ms < 0
                          ? `Estimates are ${formatDuration(Math.abs(data.etaAccuracyStats.avg_bias_ms))} too long on average`
                          : 'Estimates are accurate on average'}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Completion Rate by Wait Time */}
            {data.completionByWait && data.completionByWait.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Completion by Wait Time</Text>
                <View style={styles.card}>
                  {data.completionByWait.map((bucket) => {
                    const completionRate =
                      bucket.total > 0 ? Math.round((bucket.served / bucket.total) * 100) : 0;
                    const bucketLabel =
                      bucket.wait_bucket === 'under_5min'
                        ? '< 5 min'
                        : bucket.wait_bucket === '5_to_15min'
                          ? '5-15 min'
                          : bucket.wait_bucket === '15_to_30min'
                            ? '15-30 min'
                            : '> 30 min';
                    return (
                      <View key={bucket.wait_bucket} style={styles.completionRow}>
                        <Text style={styles.completionBucket}>{bucketLabel}</Text>
                        <View style={styles.completionBarContainer}>
                          <View
                            style={[styles.completionBarFill, { width: `${completionRate}%` }]}
                          />
                        </View>
                        <Text style={styles.completionRate}>{completionRate}%</Text>
                        <Text style={styles.completionCount}>({bucket.total})</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Platform Breakdown */}
            {data.platformBreakdown && data.platformBreakdown.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Platform Breakdown</Text>
                <View style={styles.card}>
                  {data.platformBreakdown.map((platform) => (
                    <View key={platform.platform} style={styles.platformItem}>
                      <View style={styles.platformIcon}>
                        <Text style={{ fontSize: 12 }}>
                          {platform.platform === 'ios'
                            ? 'iOS'
                            : platform.platform === 'android'
                              ? 'And'
                              : 'Web'}
                        </Text>
                      </View>
                      <Text style={styles.platformName}>
                        {platform.platform === 'ios'
                          ? 'iOS'
                          : platform.platform === 'android'
                            ? 'Android'
                            : platform.platform === 'web'
                              ? 'Web'
                              : platform.platform}
                      </Text>
                      <Text style={styles.platformCount}>{formatNumber(platform.count)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* All Events */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Event Breakdown</Text>
              <View style={styles.card}>
                {data.eventCounts?.slice(0, 15).map((event) => (
                  <View key={event.type} style={styles.eventRow}>
                    <Text style={styles.eventType}>{event.type}</Text>
                    <Text style={styles.eventCount}>{formatNumber(event.count)}</Text>
                  </View>
                ))}
                {(!data.eventCounts || data.eventCounts.length === 0) && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No events recorded</Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaProvider>
  );
}
