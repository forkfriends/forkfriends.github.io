import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import type { RootStackParamList } from '../../types/navigation';
import { API_BASE_URL } from '../../lib/backend';
import { useAuth } from '../../contexts/AuthContext';
import styles, { createResponsiveStyles } from './AdminDashboardScreen.Styles';

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
  trustSurveyStats: {
    total_responses: number;
    trust_yes: number;
    trust_no: number;
  };
}

const PERIOD_OPTIONS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

// Storage key must match AuthContext
const AUTH_SESSION_KEY = 'queueup-auth-session';

// Breakpoints
const DESKTOP_BREAKPOINT = 1024;
const TABLET_BREAKPOINT = 768;

// Get session token for API calls (needed for cross-origin like localhost)
async function getSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(AUTH_SESSION_KEY);
    } catch {
      return null;
    }
  }
  // Native: use AsyncStorage
  try {
    return await AsyncStorage.getItem(AUTH_SESSION_KEY);
  } catch {
    return null;
  }
}

// Chart colors
const CHART_COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  gray: '#6b7280',
  purple: '#8b5cf6',
  pink: '#ec4899',
  indigo: '#6366f1',
};

const STATUS_COLORS: Record<string, string> = {
  served: CHART_COLORS.success,
  waiting: CHART_COLORS.primary,
  called: CHART_COLORS.warning,
  left: CHART_COLORS.danger,
  no_show: CHART_COLORS.gray,
  kicked: CHART_COLORS.pink,
};

export default function AdminDashboardScreen(_props: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const responsiveStyles = createResponsiveStyles(width);

  const { user, isLoading: authLoading, isAdmin, login } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState(7);
  const [refreshing, setRefreshing] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{
    day: string;
    count: number;
    index: number;
  } | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{
    label: string;
    value: number;
    index: number;
    chartId: string;
  } | null>(null);
  const [hoveredFunnel, setHoveredFunnel] = useState<number | null>(null);

  const fetchAnalytics = useCallback(async (days: number) => {
    try {
      setError(null);
      const headers: HeadersInit = {};
      const token = await getSessionToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/api/analytics?days=${days}`, {
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Not authenticated');
        }
        if (response.status === 403) {
          throw new Error('Access denied - admin privileges required');
        }
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
    if (user) {
      setLoading(true);
      void fetchAnalytics(selectedDays);
    }
  }, [selectedDays, fetchAnalytics, user]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchAnalytics(selectedDays);
  }, [selectedDays, fetchAnalytics]);

  const handleExport = useCallback(
    async (exportType: 'parties' | 'events' | 'queues') => {
      try {
        const headers: HeadersInit = {};
        const token = await getSessionToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${API_BASE_URL}/api/analytics/export?days=${selectedDays}&type=${exportType}`,
          {
            headers,
            credentials: 'include',
          }
        );

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setError('Not authorized to export data');
            return;
          }
          throw new Error('Export failed');
        }

        // Get the blob and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queueup-${exportType}-${selectedDays}d.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed');
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

  const getPlatformLabel = (platform: string): string => {
    const labels: Record<string, string> = {
      ios: 'iOS (Native)',
      android: 'Android (Native)',
      ios_web: 'iOS (Web)',
      android_web: 'Android (Web)',
      web: 'Desktop',
    };
    return labels[platform] || platform;
  };

  // Donut chart component
  const renderDonutChart = (
    segments: Array<{ label: string; value: number; color: string }>,
    size: number = 120
  ) => {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) {
      return (
        <View style={[styles.donutContainer, { width: size, height: size }]}>
          <View style={[styles.donutEmpty, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={styles.donutEmptyText}>No data</Text>
          </View>
        </View>
      );
    }

    // Calculate segments for conic gradient (web only)
    let cumulativePercent = 0;
    const gradientStops = segments
      .filter((s) => s.value > 0)
      .map((segment) => {
        const percent = (segment.value / total) * 100;
        const start = cumulativePercent;
        cumulativePercent += percent;
        return `${segment.color} ${start}% ${cumulativePercent}%`;
      })
      .join(', ');

    const innerSize = size * 0.6;

    return (
      <View style={styles.donutWrapper}>
        <View
          style={[
            styles.donutContainer,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              // @ts-ignore - web-only style
              background: `conic-gradient(${gradientStops})`,
            },
          ]}>
          <View
            style={[
              styles.donutInner,
              {
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2,
              },
            ]}>
            <Text style={styles.donutTotal}>{formatNumber(total)}</Text>
            <Text style={styles.donutTotalLabel}>Total</Text>
          </View>
        </View>
        <View style={styles.donutLegend}>
          {segments
            .filter((s) => s.value > 0)
            .map((segment) => (
              <View key={segment.label} style={styles.donutLegendItem}>
                <View style={[styles.donutLegendDot, { backgroundColor: segment.color }]} />
                <Text style={styles.donutLegendLabel}>{segment.label}</Text>
                <Text style={styles.donutLegendValue}>{formatNumber(segment.value)}</Text>
              </View>
            ))}
        </View>
      </View>
    );
  };

  // Bar chart with labels
  const renderBarChart = (
    chartData: Array<{ label: string; value: number; color?: string }>,
    options: { height?: number; showValues?: boolean; horizontal?: boolean; chartId?: string } = {}
  ) => {
    const { height = 200, showValues = true, horizontal = false, chartId = 'default' } = options;
    const maxValue = Math.max(...chartData.map((d) => d.value), 1);

    if (horizontal) {
      return (
        <View style={styles.horizontalBarChart}>
          {chartData.map((item, index) => {
            const percent = (item.value / maxValue) * 100;
            const isHovered = hoveredBar?.chartId === chartId && hoveredBar?.index === index;
            return (
              <Pressable
                key={item.label}
                style={[
                  styles.horizontalBarRow,
                  { position: 'relative', zIndex: isHovered ? 10 : 1 },
                ]}
                onHoverIn={() =>
                  setHoveredBar({ label: item.label, value: item.value, index, chartId })
                }
                onHoverOut={() => setHoveredBar(null)}>
                <Text style={styles.horizontalBarLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <View style={[styles.horizontalBarTrack, { position: 'relative' }]}>
                  <View
                    style={[
                      styles.horizontalBarFill,
                      {
                        width: `${Math.max(percent, 2)}%`,
                        backgroundColor: item.color || CHART_COLORS.primary,
                      },
                      isHovered && styles.barHovered,
                    ]}
                  />
                </View>
                {showValues && (
                  <Text style={styles.horizontalBarValue}>{formatNumber(item.value)}</Text>
                )}
                {isHovered && (
                  <View style={styles.barTooltipHorizontal}>
                    <Text style={styles.chartTooltipText}>
                      {item.label}: {formatNumber(item.value)}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      );
    }

    return (
      <View style={[styles.barChartContainer, { height }]}>
        <View style={styles.barChartBars}>
          {chartData.map((item, index) => {
            const percent = (item.value / maxValue) * 100;
            const isHovered = hoveredBar?.chartId === chartId && hoveredBar?.index === index;
            return (
              <Pressable
                key={item.label}
                style={[styles.barChartColumn, { zIndex: isHovered ? 10 : 1 }]}
                onHoverIn={() =>
                  setHoveredBar({ label: item.label, value: item.value, index, chartId })
                }
                onHoverOut={() => setHoveredBar(null)}>
                <View style={[styles.barChartBarWrapper, { position: 'relative' }]}>
                  {showValues && item.value > 0 && (
                    <Text style={styles.barChartValue}>{formatNumber(item.value)}</Text>
                  )}
                  <View
                    style={[
                      styles.barChartBar,
                      {
                        height: `${Math.max(percent, 3)}%`,
                        backgroundColor: item.color || CHART_COLORS.primary,
                      },
                      isHovered && styles.barHovered,
                    ]}
                  />
                  {isHovered && (
                    <View style={styles.barTooltipVerticalFixed}>
                      <Text style={styles.chartTooltipText}>
                        {item.label}: {formatNumber(item.value)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.barChartLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  // Line/Area chart for daily activity
  const renderAreaChart = () => {
    if (!data?.dailyEvents || data.dailyEvents.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data for this period</Text>
        </View>
      );
    }

    const maxCount = Math.max(...data.dailyEvents.map((d) => d.count), 1);
    const days = data.dailyEvents;
    const chartHeight = isDesktop ? 180 : 120;

    // Create SVG path for area chart (web)
    const points = days.map((day, index) => {
      const x = (index / (days.length - 1 || 1)) * 100;
      const y = 100 - (day.count / maxCount) * 100;
      return `${x},${y}`;
    });

    const linePath = `M ${points.join(' L ')}`;
    const areaPath = `M 0,100 L ${points.join(' L ')} L 100,100 Z`;

    return (
      <View style={[styles.areaChartContainer, { height: chartHeight }]}>
        {/* Y-axis labels */}
        <View style={styles.areaChartYAxis}>
          <Text style={styles.areaChartYLabel}>{formatNumber(maxCount)}</Text>
          <Text style={styles.areaChartYLabel}>{formatNumber(Math.round(maxCount / 2))}</Text>
          <Text style={styles.areaChartYLabel}>0</Text>
        </View>

        {/* Chart area */}
        <View style={styles.areaChartMain}>
          {/* Grid lines */}
          <View style={styles.areaChartGrid}>
            <View style={styles.areaChartGridLine} />
            <View style={styles.areaChartGridLine} />
            <View style={styles.areaChartGridLine} />
          </View>

          {/* SVG Chart */}
          <Svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
            }}>
            <Path d={areaPath} fill="rgba(59, 130, 246, 0.2)" />
            <Path
              d={linePath}
              fill="none"
              stroke={CHART_COLORS.primary}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </Svg>

          {/* Data points with hover */}
          <View style={styles.areaChartPoints}>
            {days.map((day, index) => {
              const leftPercent = `${(index / (days.length - 1 || 1)) * 100}%` as const;
              const bottomPercent = `${(day.count / maxCount) * 100}%` as const;
              const isHovered = hoveredPoint?.index === index;
              return (
                <Pressable
                  key={day.day}
                  onHoverIn={() => setHoveredPoint({ day: day.day, count: day.count, index })}
                  onHoverOut={() => setHoveredPoint(null)}
                  style={[
                    styles.areaChartPoint,
                    {
                      left: leftPercent as `${number}%`,
                      bottom: bottomPercent as `${number}%`,
                    },
                    isHovered && styles.areaChartPointHovered,
                  ]}>
                  <View
                    style={isHovered ? styles.areaChartPointDotHovered : styles.areaChartPointDot}
                  />
                  {isHovered && (
                    <View style={styles.chartTooltip}>
                      <Text style={styles.chartTooltipText}>
                        {day.day.slice(5)}: {formatNumber(day.count)} events
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* X-axis labels */}
        <View style={styles.areaChartXAxis}>
          {days.length > 0 && (
            <>
              <Text style={styles.areaChartXLabel}>{days[0]?.day?.slice(5) || ''}</Text>
              {days.length > 2 && (
                <Text style={styles.areaChartXLabel}>
                  {days[Math.floor(days.length / 2)]?.day?.slice(5) || ''}
                </Text>
              )}
              <Text style={styles.areaChartXLabel}>
                {days[days.length - 1]?.day?.slice(5) || ''}
              </Text>
            </>
          )}
        </View>
      </View>
    );
  };

  // Stat card component
  const StatCard = ({
    value,
    label,
    trend,
    color,
  }: {
    value: string;
    label: string;
    trend?: 'up' | 'down' | null;
    color?: string;
  }) => (
    <View
      style={[responsiveStyles.statCard, color && { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <Text style={responsiveStyles.statCardValue}>{value}</Text>
      <Text style={responsiveStyles.statCardLabel}>{label}</Text>
    </View>
  );

  // Generate insights from the data
  const generateInsights = (): Array<{
    text: string;
    type: 'info' | 'success' | 'warning' | 'trend_up' | 'trend_down';
    highlight?: string;
    priority: number; // Higher = more important
  }> => {
    if (!data) return [];

    const insights: Array<{
      text: string;
      type: 'info' | 'success' | 'warning' | 'trend_up' | 'trend_down';
      highlight?: string;
      priority: number;
    }> = [];

    // Helper to calculate rates safely
    const safeRate = (num: number, denom: number) => (denom > 0 ? num / denom : 0);

    // === FUNNEL INSIGHTS ===
    const completed = data.joinFunnel?.join_completed ?? 0;
    const abandoned = data.joinFunnel?.abandoned ?? 0;
    const totalFlow = completed + abandoned;

    if (totalFlow >= 5) {
      const completionRate = Math.round(safeRate(completed, totalFlow) * 100);
      if (completionRate >= 75) {
        insights.push({
          text: `${completionRate}% of guests who start joining complete the flow — signup experience is solid.`,
          type: 'success',
          priority: 8,
        });
      } else if (completionRate < 60) {
        insights.push({
          text: `${100 - completionRate}% abandon the join flow. Consider simplifying the form or adding a progress indicator.`,
          type: 'warning',
          priority: 9,
        });
      }
    }

    // === PUSH NOTIFICATIONS ===
    const pushGranted = data.pushStats?.push_granted ?? 0;
    const pushDenied = data.pushStats?.push_denied ?? 0;
    const nudgesSent = data.pushStats?.nudges_sent ?? 0;
    const nudgesAcked = data.pushStats?.nudges_acked ?? 0;
    const totalPushResponses = pushGranted + pushDenied;

    // Only show nudge ack rate if we actually sent nudges
    if (nudgesSent >= 5) {
      const ackRate = Math.round(safeRate(nudgesAcked, nudgesSent) * 100);
      if (ackRate >= 60) {
        insights.push({
          text: `${ackRate}% of "you're up" notifications are acknowledged — push is effectively bringing guests back.`,
          type: 'success',
          priority: 7,
        });
      } else if (ackRate < 30) {
        insights.push({
          text: `Only ${ackRate}% of push notifications are acknowledged. Guests may be missing them.`,
          type: 'warning',
          priority: 6,
        });
      }
    } else if (totalPushResponses >= 10) {
      // Fall back to opt-in rate if no nudges sent
      const optInRate = Math.round(safeRate(pushGranted, totalPushResponses) * 100);
      if (optInRate >= 80) {
        insights.push({
          text: `${optInRate}% push notification opt-in — guests want to be notified when it's their turn.`,
          type: 'success',
          priority: 6,
        });
      } else if (optInRate >= 60) {
        insights.push({
          text: `${optInRate}% of guests enable push notifications for queue updates.`,
          type: 'info',
          priority: 4,
        });
      } else if (optInRate < 40) {
        insights.push({
          text: `Low ${optInRate}% push opt-in. Try asking for permission after they join, not before.`,
          type: 'warning',
          priority: 5,
        });
      }
    }

    // === TRUST SURVEY ===
    if (data.trustSurveyStats && data.trustSurveyStats.total_responses >= 3) {
      const trustRate = Math.round(
        safeRate(data.trustSurveyStats.trust_yes, data.trustSurveyStats.total_responses) * 100
      );
      if (trustRate >= 80) {
        insights.push({
          text: `${trustRate}% of guests say the estimated wait time "looks right" — they trust the queue.`,
          type: 'success',
          priority: 7,
        });
      } else if (trustRate < 50) {
        insights.push({
          text: `Only ${trustRate}% trust the wait time estimate. Consider showing how it's calculated.`,
          type: 'warning',
          priority: 6,
        });
      }
    }

    // === WAIT TIME DATA QUALITY ===
    const avgWait = data.waitTimeStats?.avg_wait_ms;
    const totalServed = data.waitTimeStats?.total_served ?? 0;
    const totalQueues = data.queueStats?.total_queues ?? 0;

    if (totalQueues > 0 && totalServed === 0) {
      insights.push({
        text: `No wait time data recorded — ensure hosts are marking guests as "served" to track this.`,
        type: 'warning',
        priority: 8,
      });
    } else if (avgWait && totalServed >= 5) {
      const avgMinutes = Math.round(avgWait / 60000);
      if (avgMinutes <= 5) {
        insights.push({
          text: `Average wait is just ${avgMinutes} minutes — guests are being served quickly.`,
          type: 'success',
          priority: 5,
        });
      } else if (avgMinutes > 20) {
        insights.push({
          text: `${avgMinutes} minute average wait may be causing abandonment. Consider ways to speed up service.`,
          type: 'warning',
          priority: 7,
        });
      }
    }

    // === QUEUE PERFORMANCE VARIANCE ===
    if (data.perQueueStats && data.perQueueStats.length >= 2) {
      const queuesWithData = data.perQueueStats.filter((q) => q.total_parties >= 5);

      if (queuesWithData.length >= 2) {
        const rates = queuesWithData.map((q) => ({
          name: q.event_name || q.short_code,
          rate: safeRate(q.served_count, q.total_parties),
          total: q.total_parties,
        }));

        const best = rates.reduce((a, b) => (a.rate > b.rate ? a : b));
        const worst = rates.reduce((a, b) => (a.rate < b.rate ? a : b));
        const bestRate = Math.round(best.rate * 100);
        const worstRate = Math.round(worst.rate * 100);

        // Only show if there's a meaningful gap
        if (bestRate - worstRate >= 40 && worstRate < 50) {
          insights.push({
            text: `"${best.name}" completes ${bestRate}% vs "${worst.name}" at ${worstRate}%. What's different about these events?`,
            type: 'info',
            priority: 6,
          });
        }
      }
    }

    // === NO-SHOW RATE ===
    const totalParties = data.partyStats?.reduce((sum, s) => sum + s.count, 0) ?? 0;
    const noShows = data.partyStats?.find((s) => s.status === 'no_show')?.count ?? 0;
    if (totalParties >= 15 && noShows >= 3) {
      const noShowRate = Math.round(safeRate(noShows, totalParties) * 100);
      if (noShowRate >= 15) {
        insights.push({
          text: `${noShowRate}% no-show rate. Try sending a reminder when guests are 2-3 spots away.`,
          type: 'warning',
          priority: 7,
        });
      } else if (noShowRate <= 5) {
        insights.push({
          text: `Low ${noShowRate}% no-show rate — guests are showing up when called.`,
          type: 'success',
          priority: 4,
        });
      }
    }

    // === PLATFORM BREAKDOWN ===
    if (data.platformBreakdown && data.platformBreakdown.length > 0) {
      const totalByPlatform = data.platformBreakdown.reduce((sum, p) => sum + p.count, 0);
      const desktop = data.platformBreakdown.find((p) => p.platform === 'web');
      const desktopCount = desktop?.count ?? 0;
      const desktopPercent = Math.round(safeRate(desktopCount, totalByPlatform) * 100);

      if (desktopPercent >= 90) {
        insights.push({
          text: `${desktopPercent}% of traffic is from desktop — guests may be using kiosks or hosts are testing.`,
          type: 'info',
          priority: 3,
        });
      } else if (desktopPercent < 20) {
        const mobilePercent = 100 - desktopPercent;
        insights.push({
          text: `${mobilePercent}% of guests join from mobile — the mobile experience is key.`,
          type: 'info',
          priority: 4,
        });
      }
    }

    // === ABANDONMENT PATTERNS ===
    const totalLeft = data.abandonmentStats?.total_left ?? 0;
    const leftUnder5 = data.abandonmentStats?.left_under_5min ?? 0;
    const leftOver15 = data.abandonmentStats?.left_over_15min ?? 0;

    if (totalLeft >= 5) {
      const earlyLeaveRate = Math.round(safeRate(leftUnder5, totalLeft) * 100);
      const lateLeaveRate = Math.round(safeRate(leftOver15, totalLeft) * 100);

      if (earlyLeaveRate >= 60) {
        insights.push({
          text: `${earlyLeaveRate}% leave within 5 minutes — show the ETA immediately so they know what to expect.`,
          type: 'info',
          priority: 5,
        });
      } else if (lateLeaveRate >= 50) {
        insights.push({
          text: `${lateLeaveRate}% abandon after 15+ min of waiting. A "you're almost up" notification could help.`,
          type: 'warning',
          priority: 6,
        });
      }
    }

    // === ETA ACCURACY ===
    if (data.etaAccuracyStats && data.etaAccuracyStats.total_with_eta >= 5) {
      const within5min = data.etaAccuracyStats.within_5min;
      const total = data.etaAccuracyStats.total_with_eta;
      const accuracy = Math.round(safeRate(within5min, total) * 100);

      if (accuracy >= 80) {
        insights.push({
          text: `ETA predictions are ${accuracy}% accurate within 5 min — guests can rely on the time shown.`,
          type: 'success',
          priority: 6,
        });
      } else if (accuracy < 50) {
        const biasMs = data.etaAccuracyStats.avg_bias_ms ?? 0;
        if (biasMs > 60000) {
          insights.push({
            text: `ETAs are running ${Math.round(biasMs / 60000)} min short on average. Guests wait longer than shown.`,
            type: 'warning',
            priority: 7,
          });
        } else if (biasMs < -60000) {
          insights.push({
            text: `ETAs are ${Math.round(Math.abs(biasMs) / 60000)} min too long. Guests are called sooner than expected.`,
            type: 'info',
            priority: 5,
          });
        }
      }
    }

    // Sort by priority (highest first) and take top 5
    return insights.sort((a, b) => b.priority - a.priority).slice(0, 5);
  };

  // Render insights panel
  const renderInsightsPanel = () => {
    const insights = generateInsights();
    if (insights.length === 0) return null;

    const getIcon = (type: string) => {
      switch (type) {
        case 'success':
          return <CheckCircle size={16} color="#065f46" />;
        case 'warning':
          return <AlertTriangle size={16} color="#92400e" />;
        case 'trend_up':
          return <TrendingUp size={16} color="#065f46" />;
        case 'trend_down':
          return <TrendingDown size={16} color="#92400e" />;
        default:
          return <Info size={16} color="#1e40af" />;
      }
    };

    return (
      <View style={styles.insightsCard}>
        <View style={styles.insightsHeader}>
          <Lightbulb size={20} color="#1e40af" />
          <Text style={styles.insightsTitle}>Insights (last {selectedDays} days)</Text>
        </View>
        <View style={styles.insightsList}>
          {insights.map((insight, index) => (
            <View key={index} style={styles.insightItem}>
              <View style={styles.insightIconWrapper}>{getIcon(insight.type)}</View>
              <Text
                style={[
                  styles.insightText,
                  (insight.type === 'warning' || insight.type === 'trend_down') &&
                    styles.insightWarningText,
                  (insight.type === 'success' || insight.type === 'trend_up') &&
                    styles.insightSuccessText,
                ]}>
                {insight.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // Conversion funnel (enhanced)
  const renderConversionFunnel = () => {
    const scans = data?.joinFunnel?.qr_scanned ?? 0;
    const started = data?.joinFunnel?.join_started ?? 0;
    const completed = data?.joinFunnel?.join_completed ?? 0;
    const abandoned = data?.joinFunnel?.abandoned ?? 0;

    const steps = [
      { label: 'QR Scanned', value: scans, color: CHART_COLORS.gray },
      { label: 'Join Started', value: started, color: CHART_COLORS.primary },
      { label: 'Completed', value: completed, color: CHART_COLORS.success },
      { label: 'Abandoned', value: abandoned, color: CHART_COLORS.danger },
    ];

    const maxValue = Math.max(...steps.map((s) => s.value), 1);

    return (
      <View style={styles.funnelContainer}>
        {steps.map((step, index) => {
          const percent = (step.value / maxValue) * 100;
          const rate =
            index > 0 && steps[index - 1].value > 0
              ? Math.round((step.value / steps[index - 1].value) * 100)
              : 100;
          const isHovered = hoveredFunnel === index;

          return (
            <Pressable
              key={step.label}
              style={[styles.funnelStep, { position: 'relative', zIndex: isHovered ? 10 : 1 }]}
              onHoverIn={() => setHoveredFunnel(index)}
              onHoverOut={() => setHoveredFunnel(null)}>
              <View style={styles.funnelStepHeader}>
                <Text style={styles.funnelStepLabel}>{step.label}</Text>
                <Text style={styles.funnelStepValue}>
                  {formatNumber(step.value)}
                  {index > 0 && <Text style={styles.funnelStepRate}> ({rate}%)</Text>}
                </Text>
              </View>
              <View style={styles.funnelBarTrack}>
                <View
                  style={[
                    styles.funnelBarFill,
                    {
                      width: `${Math.max(percent, 2)}%`,
                      backgroundColor: step.color,
                    },
                    isHovered && styles.barHovered,
                  ]}
                />
              </View>
              {isHovered && (
                <View style={styles.funnelTooltip}>
                  <Text style={styles.chartTooltipText}>
                    {step.label}: {formatNumber(step.value)}
                    {index > 0 ? ` (${rate}% of previous)` : ''}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  };

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
          <Text style={styles.title}>Analytics Dashboard</Text>
          <Text style={[styles.loadingText, { marginTop: 16, marginBottom: 24 }]}>
            Please log in to view analytics
          </Text>
          <Pressable style={styles.retryButton} onPress={() => login()}>
            <Text style={styles.retryButtonText}>Log in with GitHub</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  // Show access denied if not admin
  if (!isAdmin) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.title}>Access Denied</Text>
          <Text style={[styles.loadingText, { marginTop: 16, marginBottom: 8, color: '#dc2626' }]}>
            You do not have permission to access this page.
          </Text>
          <Text style={[styles.loadingText, { marginBottom: 24, color: '#666' }]}>
            Only administrators can view the analytics dashboard.
          </Text>
          <Text style={[styles.loadingText, { fontSize: 12, color: '#999' }]}>
            Logged in as: {user.github_username || user.google_name || user.email}
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

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

  // Desktop layout
  if (isDesktop && data) {
    return (
      <SafeAreaProvider style={styles.safe}>
        <ScrollView
          style={responsiveStyles.container}
          contentContainerStyle={responsiveStyles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
          {/* Header */}
          <View style={responsiveStyles.header}>
            <View style={responsiveStyles.headerLeft}>
              <Text style={responsiveStyles.title}>Analytics Dashboard</Text>
              <Text style={responsiveStyles.subtitle}>Data from the last {selectedDays} days</Text>
            </View>
            <View style={responsiveStyles.headerRight}>
              <View style={responsiveStyles.periodSelector}>
                {PERIOD_OPTIONS.map((option) => (
                  <Pressable
                    key={option.days}
                    style={[
                      responsiveStyles.periodButton,
                      selectedDays === option.days && responsiveStyles.periodButtonActive,
                    ]}
                    onPress={() => setSelectedDays(option.days)}>
                    <Text
                      style={[
                        responsiveStyles.periodButtonText,
                        selectedDays === option.days && responsiveStyles.periodButtonTextActive,
                      ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={responsiveStyles.exportButtons}>
                <Pressable
                  style={responsiveStyles.exportButton}
                  onPress={() => handleExport('parties')}>
                  <Text style={responsiveStyles.exportButtonText}>Export Parties</Text>
                </Pressable>
                <Pressable
                  style={responsiveStyles.exportButton}
                  onPress={() => handleExport('queues')}>
                  <Text style={responsiveStyles.exportButtonText}>Export Queues</Text>
                </Pressable>
              </View>
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

          {/* KPI Row */}
          <View style={responsiveStyles.kpiRow}>
            <StatCard
              value={formatNumber(data.queueStats?.total_queues)}
              label="Total Queues"
              color={CHART_COLORS.primary}
            />
            <StatCard
              value={formatNumber(data.queueStats?.active_queues)}
              label="Active Queues"
              color={CHART_COLORS.success}
            />
            <StatCard
              value={formatDuration(data.waitTimeStats?.avg_wait_ms)}
              label="Avg Wait Time"
              color={CHART_COLORS.warning}
            />
            <StatCard
              value={formatNumber(data.waitTimeStats?.total_served)}
              label="Total Served"
              color={CHART_COLORS.success}
            />
            <StatCard
              value={formatNumber(data.abandonmentStats?.total_left)}
              label="Total Left"
              color={CHART_COLORS.danger}
            />
            <StatCard
              value={
                data.pushStats?.nudges_sent
                  ? `${Math.round((data.pushStats.nudges_acked / data.pushStats.nudges_sent) * 100)}%`
                  : '-'
              }
              label="Push Ack Rate"
              color={CHART_COLORS.purple}
            />
          </View>

          {/* Insights Panel */}
          {renderInsightsPanel()}

          {/* Main Grid */}
          <View style={responsiveStyles.mainGrid}>
            {/* Left Column - 2/3 width */}
            <View style={responsiveStyles.mainColumn}>
              {/* Daily Activity Chart */}
              <View style={responsiveStyles.card}>
                <Text style={responsiveStyles.cardTitle}>Daily Activity</Text>
                {renderAreaChart()}
              </View>

              {/* Two column layout for charts */}
              <View style={responsiveStyles.twoColumnRow}>
                {/* Conversion Funnel */}
                <View style={[responsiveStyles.card, { flex: 1 }]}>
                  <Text style={responsiveStyles.cardTitle}>Conversion Funnel</Text>
                  {renderConversionFunnel()}
                </View>

                {/* Party Outcomes Donut */}
                <View style={[responsiveStyles.card, { flex: 1 }]}>
                  <Text style={responsiveStyles.cardTitle}>Party Outcomes</Text>
                  {renderDonutChart(
                    (data.partyStats || []).map((stat) => ({
                      label: getPartyStatusLabel(stat.status),
                      value: stat.count,
                      color: STATUS_COLORS[stat.status] || CHART_COLORS.gray,
                    })),
                    140
                  )}
                </View>
              </View>

              {/* Completion by Wait Time */}
              {data.completionByWait && data.completionByWait.length > 0 && (
                <View style={responsiveStyles.card}>
                  <Text style={responsiveStyles.cardTitle}>Completion Rate by Wait Time</Text>
                  {renderBarChart(
                    data.completionByWait.map((bucket) => ({
                      label:
                        bucket.wait_bucket === 'under_5min'
                          ? '< 5m'
                          : bucket.wait_bucket === '5_to_15min'
                            ? '5-15m'
                            : bucket.wait_bucket === '15_to_30min'
                              ? '15-30m'
                              : '> 30m',
                      value:
                        bucket.total > 0 ? Math.round((bucket.served / bucket.total) * 100) : 0,
                      color: CHART_COLORS.success,
                    })),
                    { height: 160, chartId: 'completion-by-wait' }
                  )}
                </View>
              )}

              {/* Queue Performance Table */}
              {data.perQueueStats && data.perQueueStats.length > 0 && (
                <View style={responsiveStyles.card}>
                  <Text style={responsiveStyles.cardTitle}>Queue Performance</Text>
                  <View style={responsiveStyles.table}>
                    <View style={responsiveStyles.tableHeader}>
                      <Text style={[responsiveStyles.tableHeaderCell, { flex: 2 }]}>Queue</Text>
                      <Text style={responsiveStyles.tableHeaderCell}>Joined</Text>
                      <Text style={responsiveStyles.tableHeaderCell}>Served</Text>
                      <Text style={responsiveStyles.tableHeaderCell}>Left</Text>
                      <Text style={responsiveStyles.tableHeaderCell}>Avg Wait</Text>
                      <Text style={responsiveStyles.tableHeaderCell}>Rate</Text>
                    </View>
                    {data.perQueueStats.slice(0, 10).map((queue) => {
                      const completionRate =
                        queue.total_parties > 0
                          ? Math.round((queue.served_count / queue.total_parties) * 100)
                          : 0;
                      return (
                        <View key={queue.session_id} style={responsiveStyles.tableRow}>
                          <View style={[responsiveStyles.tableCell, { flex: 2 }]}>
                            <Text style={responsiveStyles.tableCellPrimary} numberOfLines={1}>
                              {queue.event_name || queue.short_code}
                            </Text>
                            <Text style={responsiveStyles.tableCellSecondary}>
                              {queue.short_code}
                            </Text>
                          </View>
                          <Text style={responsiveStyles.tableCell}>{queue.total_parties}</Text>
                          <Text style={responsiveStyles.tableCell}>{queue.served_count}</Text>
                          <Text style={responsiveStyles.tableCell}>{queue.left_count}</Text>
                          <Text style={responsiveStyles.tableCell}>
                            {formatDuration(queue.avg_wait_ms)}
                          </Text>
                          <View style={responsiveStyles.tableCell}>
                            <View style={responsiveStyles.rateBar}>
                              <View
                                style={[
                                  responsiveStyles.rateBarFill,
                                  {
                                    width: `${completionRate}%`,
                                    backgroundColor:
                                      completionRate >= 70
                                        ? CHART_COLORS.success
                                        : completionRate >= 40
                                          ? CHART_COLORS.warning
                                          : CHART_COLORS.danger,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={responsiveStyles.rateText}>{completionRate}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* Right Column - 1/3 width */}
            <View style={responsiveStyles.sideColumn}>
              {/* Host Actions */}
              <View style={responsiveStyles.card}>
                <Text style={responsiveStyles.cardTitle}>Host Actions</Text>
                {renderBarChart(
                  [
                    {
                      label: 'Created',
                      value: data.hostActions?.queues_created ?? 0,
                      color: CHART_COLORS.primary,
                    },
                    {
                      label: 'Call Next',
                      value: data.hostActions?.call_next ?? 0,
                      color: CHART_COLORS.success,
                    },
                    {
                      label: 'Call Specific',
                      value: data.hostActions?.call_specific ?? 0,
                      color: CHART_COLORS.warning,
                    },
                    {
                      label: 'Closed',
                      value: data.hostActions?.queues_closed ?? 0,
                      color: CHART_COLORS.gray,
                    },
                  ],
                  { horizontal: true, chartId: 'host-actions' }
                )}
              </View>

              {/* Push Notifications */}
              <View style={responsiveStyles.card}>
                <Text style={responsiveStyles.cardTitle}>Push Notifications</Text>
                {renderDonutChart(
                  [
                    {
                      label: 'Granted',
                      value: data.pushStats?.push_granted ?? 0,
                      color: CHART_COLORS.success,
                    },
                    {
                      label: 'Denied',
                      value: data.pushStats?.push_denied ?? 0,
                      color: CHART_COLORS.danger,
                    },
                    {
                      label: 'Pending',
                      value: Math.max(
                        (data.pushStats?.prompts_shown ?? 0) -
                          (data.pushStats?.push_granted ?? 0) -
                          (data.pushStats?.push_denied ?? 0),
                        0
                      ),
                      color: CHART_COLORS.gray,
                    },
                  ],
                  100
                )}
              </View>

              {/* Platform Breakdown */}
              {data.platformBreakdown && data.platformBreakdown.length > 0 && (
                <View style={responsiveStyles.card}>
                  <Text style={responsiveStyles.cardTitle}>Platforms</Text>
                  {renderDonutChart(
                    data.platformBreakdown.map((p, i) => ({
                      label: getPlatformLabel(p.platform),
                      value: p.count,
                      color: [
                        CHART_COLORS.primary,
                        CHART_COLORS.success,
                        CHART_COLORS.purple,
                        CHART_COLORS.warning,
                        CHART_COLORS.pink,
                      ][i % 5],
                    })),
                    100
                  )}
                </View>
              )}

              {/* Wait Time Stats */}
              <View style={responsiveStyles.card}>
                <Text style={responsiveStyles.cardTitle}>Wait Time Analysis</Text>
                <View style={responsiveStyles.miniStats}>
                  <View style={responsiveStyles.miniStatItem}>
                    <Text style={responsiveStyles.miniStatValue}>
                      {formatDuration(data.waitTimeStats?.avg_wait_ms)}
                    </Text>
                    <Text style={responsiveStyles.miniStatLabel}>Average</Text>
                  </View>
                  <View style={responsiveStyles.miniStatItem}>
                    <Text style={responsiveStyles.miniStatValue}>
                      {formatDuration(data.waitTimeStats?.min_wait_ms)}
                    </Text>
                    <Text style={responsiveStyles.miniStatLabel}>Minimum</Text>
                  </View>
                  <View style={responsiveStyles.miniStatItem}>
                    <Text style={responsiveStyles.miniStatValue}>
                      {formatDuration(data.waitTimeStats?.max_wait_ms)}
                    </Text>
                    <Text style={responsiveStyles.miniStatLabel}>Maximum</Text>
                  </View>
                </View>
              </View>

              {/* ETA Accuracy */}
              {data.etaAccuracyStats && data.etaAccuracyStats.total_with_eta > 0 && (
                <View style={responsiveStyles.card}>
                  <Text style={responsiveStyles.cardTitle}>ETA Accuracy</Text>
                  <View style={responsiveStyles.miniStats}>
                    <View style={responsiveStyles.miniStatItem}>
                      <Text style={responsiveStyles.miniStatValue}>
                        {formatDuration(
                          data.etaAccuracyStats.avg_error_ms
                            ? Math.abs(data.etaAccuracyStats.avg_error_ms)
                            : null
                        )}
                      </Text>
                      <Text style={responsiveStyles.miniStatLabel}>Avg Error</Text>
                    </View>
                    <View style={responsiveStyles.miniStatItem}>
                      <Text style={responsiveStyles.miniStatValue}>
                        {Math.round(
                          (data.etaAccuracyStats.within_5min /
                            data.etaAccuracyStats.total_with_eta) *
                            100
                        )}
                        %
                      </Text>
                      <Text style={responsiveStyles.miniStatLabel}>Within 5min</Text>
                    </View>
                  </View>
                  {data.etaAccuracyStats.avg_bias_ms !== null && (
                    <Text style={responsiveStyles.noteText}>
                      {data.etaAccuracyStats.avg_bias_ms > 0
                        ? `Estimates ${formatDuration(Math.abs(data.etaAccuracyStats.avg_bias_ms))} too short`
                        : data.etaAccuracyStats.avg_bias_ms < 0
                          ? `Estimates ${formatDuration(Math.abs(data.etaAccuracyStats.avg_bias_ms))} too long`
                          : 'Estimates accurate on average'}
                    </Text>
                  )}
                </View>
              )}

              {/* Trust Survey */}
              {data.trustSurveyStats && data.trustSurveyStats.total_responses > 0 && (
                <View style={responsiveStyles.card}>
                  <Text style={responsiveStyles.cardTitle}>Trust Survey</Text>
                  <View style={responsiveStyles.miniStats}>
                    <View style={responsiveStyles.miniStatItem}>
                      <Text style={responsiveStyles.miniStatValue}>
                        {data.trustSurveyStats.total_responses > 0
                          ? `${Math.round((data.trustSurveyStats.trust_yes / data.trustSurveyStats.total_responses) * 100)}%`
                          : '-'}
                      </Text>
                      <Text style={responsiveStyles.miniStatLabel}>Said Accurate</Text>
                    </View>
                    <View style={responsiveStyles.miniStatItem}>
                      <Text style={responsiveStyles.miniStatValue}>
                        {formatNumber(data.trustSurveyStats.total_responses)}
                      </Text>
                      <Text style={responsiveStyles.miniStatLabel}>Responses</Text>
                    </View>
                  </View>
                  {renderDonutChart(
                    [
                      {
                        label: 'Looks good',
                        value: data.trustSurveyStats.trust_yes,
                        color: CHART_COLORS.success,
                      },
                      {
                        label: 'Seems off',
                        value: data.trustSurveyStats.trust_no,
                        color: CHART_COLORS.danger,
                      },
                    ],
                    100
                  )}
                </View>
              )}

              {/* Abandonment */}
              <View style={responsiveStyles.card}>
                <Text style={responsiveStyles.cardTitle}>Abandonment</Text>
                {renderBarChart(
                  [
                    {
                      label: '< 5min',
                      value: data.abandonmentStats?.left_under_5min ?? 0,
                      color: CHART_COLORS.success,
                    },
                    {
                      label: '5-15min',
                      value: data.abandonmentStats?.left_5_to_15min ?? 0,
                      color: CHART_COLORS.warning,
                    },
                    {
                      label: '> 15min',
                      value: data.abandonmentStats?.left_over_15min ?? 0,
                      color: CHART_COLORS.danger,
                    },
                  ],
                  { horizontal: true, chartId: 'abandonment' }
                )}
                <View style={responsiveStyles.abandonmentNote}>
                  <Text style={responsiveStyles.noteText}>
                    Avg position at leave: #
                    {Math.round(data.abandonmentStats?.avg_position_at_leave ?? 0)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaProvider>
    );
  }

  // Mobile/Tablet layout (original with some enhancements)
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
            {/* Insights Panel */}
            {renderInsightsPanel()}

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
              <View style={styles.card}>{renderAreaChart()}</View>
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

            {/* Trust Survey */}
            {data.trustSurveyStats && data.trustSurveyStats.total_responses > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Trust Survey</Text>
                <View style={styles.card}>
                  <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {data.trustSurveyStats.total_responses > 0
                          ? `${Math.round((data.trustSurveyStats.trust_yes / data.trustSurveyStats.total_responses) * 100)}%`
                          : '-'}
                      </Text>
                      <Text style={styles.statLabel}>Said Accurate</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {formatNumber(data.trustSurveyStats.trust_yes)}
                      </Text>
                      <Text style={styles.statLabel}>Looks Good</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {formatNumber(data.trustSurveyStats.trust_no)}
                      </Text>
                      <Text style={styles.statLabel}>Seems Off</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {formatNumber(data.trustSurveyStats.total_responses)}
                      </Text>
                      <Text style={styles.statLabel}>Total</Text>
                    </View>
                  </View>
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
                          {platform.platform === 'ios' || platform.platform === 'ios_web'
                            ? 'iOS'
                            : platform.platform === 'android' || platform.platform === 'android_web'
                              ? 'And'
                              : 'Web'}
                        </Text>
                      </View>
                      <Text style={styles.platformName}>{getPlatformLabel(platform.platform)}</Text>
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
