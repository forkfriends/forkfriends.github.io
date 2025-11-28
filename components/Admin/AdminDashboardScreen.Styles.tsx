import { StyleSheet } from 'react-native';

// Breakpoints
const DESKTOP_BREAKPOINT = 1024;
const TABLET_BREAKPOINT = 768;

// Base styles (mobile-first)
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF9FA',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#e5e5e5',
  },
  periodButtonActive: {
    backgroundColor: '#111',
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    padding: 20,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#b91c1c',
    borderRadius: 8,
    alignSelf: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  funnelContainer: {
    gap: 12,
  },
  funnelStep: {
    gap: 6,
  },
  funnelStepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  funnelStepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  funnelStepValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  funnelStepRate: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  funnelBarTrack: {
    height: 20,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
  },
  funnelBarFill: {
    height: '100%',
    borderRadius: 10,
  },
  conversionWrapper: {
    gap: 14,
  },
  conversionSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
  },
  conversionStep: {
    gap: 6,
  },
  conversionStepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversionStepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
  conversionStepNumbers: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
  conversionBarBase: {
    width: '100%',
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  conversionBarFill: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
  },
  conversionSegmentsRow: {
    flexDirection: 'row',
    width: '100%',
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  conversionSegment: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentNotStarted: {
    backgroundColor: '#d1d5db',
  },
  segmentPending: {
    backgroundColor: '#3b82f6',
  },
  segmentCompleted: {
    backgroundColor: '#10b981',
  },
  segmentAbandoned: {
    backgroundColor: '#ef4444',
  },
  conversionSegmentText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  conversionLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 12,
  },
  conversionLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  conversionLegendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  conversionLegendLabel: {
    fontSize: 11,
    color: '#444',
  },
  conversionStepRate: {
    fontSize: 11,
    fontWeight: '500',
    color: '#555',
  },
  conversionHelp: {
    fontSize: 10,
    color: '#888',
  },
  funnelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  funnelBar: {
    height: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  funnelBarValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  funnelLabel: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  funnelPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
    width: 50,
    textAlign: 'right',
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  eventType: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  eventCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
  platformItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  platformIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#e5e5e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  platformCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  chartContainer: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingTop: 8,
  },
  chartBar: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
    minHeight: 4,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chartLabel: {
    fontSize: 10,
    color: '#999',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  queueRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  queueName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    flex: 1,
    marginRight: 8,
  },
  queueCode: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  queueStats: {
    flexDirection: 'row',
    gap: 12,
  },
  queueStatItem: {
    fontSize: 12,
    color: '#666',
  },
  etaNote: {
    fontSize: 11,
    color: '#666',
    marginTop: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  completionBucket: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    width: 65,
  },
  completionBarContainer: {
    flex: 1,
    height: 16,
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  completionBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 8,
  },
  completionRate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
    width: 36,
    textAlign: 'right',
  },
  completionCount: {
    fontSize: 11,
    color: '#888',
    width: 40,
    textAlign: 'right',
  },
  exportSection: {
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  exportTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  exportButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#111',
    borderRadius: 8,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  // Donut chart styles
  donutWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  donutContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutInner: {
    position: 'absolute',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  donutTotalLabel: {
    fontSize: 10,
    color: '#666',
  },
  donutEmpty: {
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutEmptyText: {
    fontSize: 12,
    color: '#999',
  },
  donutLegend: {
    gap: 6,
  },
  donutLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  donutLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  donutLegendLabel: {
    fontSize: 12,
    color: '#333',
    flex: 1,
    minWidth: 60,
  },
  donutLegendValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
  },
  // Horizontal bar chart
  horizontalBarChart: {
    gap: 10,
  },
  horizontalBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  horizontalBarLabel: {
    fontSize: 12,
    color: '#333',
    width: 80,
  },
  horizontalBarTrack: {
    flex: 1,
    height: 20,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
  },
  horizontalBarFill: {
    height: '100%',
    borderRadius: 10,
  },
  horizontalBarValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
    width: 40,
    textAlign: 'right',
  },
  // Vertical bar chart
  barChartContainer: {
    paddingTop: 20,
  },
  barChartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    gap: 8,
  },
  barChartColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barChartBarWrapper: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barChartBar: {
    width: '80%',
    borderRadius: 4,
  },
  barChartValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  barChartLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
    textAlign: 'center',
  },
  // Area chart
  areaChartContainer: {
    flexDirection: 'row',
  },
  areaChartYAxis: {
    width: 35,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
    paddingVertical: 4,
  },
  areaChartYLabel: {
    fontSize: 9,
    color: '#999',
  },
  areaChartMain: {
    flex: 1,
    position: 'relative',
  },
  areaChartGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  areaChartGridLine: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  areaChartPoints: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  areaChartPoint: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
    marginLeft: -3,
    marginBottom: -3,
  },
  areaChartXAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginLeft: 35,
  },
  areaChartXLabel: {
    fontSize: 10,
    color: '#999',
  },
});

// Responsive styles factory
export function createResponsiveStyles(width: number) {
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isTablet = width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT;

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: isDesktop ? 40 : isTablet ? 24 : 16,
      paddingTop: isDesktop ? 24 : 16,
      maxWidth: isDesktop ? 1400 : undefined,
      alignSelf: 'center' as const,
      width: '100%',
    },
    scrollContent: {
      paddingBottom: 48,
    },
    header: {
      flexDirection: isDesktop ? 'row' : 'column',
      justifyContent: 'space-between',
      alignItems: isDesktop ? 'center' : 'flex-start',
      marginBottom: isDesktop ? 32 : 20,
      gap: 16,
    },
    headerLeft: {
      gap: 4,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
    },
    title: {
      fontSize: isDesktop ? 32 : 28,
      fontWeight: '700',
      color: '#111',
    },
    subtitle: {
      fontSize: 14,
      color: '#666',
    },
    periodSelector: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: '#f5f5f5',
      borderRadius: 10,
      padding: 4,
    },
    periodButton: {
      paddingHorizontal: isDesktop ? 16 : 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: 'transparent',
    },
    periodButtonActive: {
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
    },
    periodButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#666',
    },
    periodButtonTextActive: {
      color: '#111',
    },
    exportButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    exportButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: '#111',
      borderRadius: 8,
    },
    exportButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#fff',
    },
    kpiRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      minWidth: isDesktop ? 150 : 140,
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      borderLeftWidth: 0,
      borderLeftColor: 'transparent',
    },
    statCardValue: {
      fontSize: isDesktop ? 28 : 24,
      fontWeight: '700',
      color: '#111',
    },
    statCardLabel: {
      fontSize: 12,
      color: '#666',
      marginTop: 4,
    },
    mainGrid: {
      flexDirection: isDesktop ? 'row' : 'column',
      gap: 24,
    },
    mainColumn: {
      flex: isDesktop ? 2 : 1,
      gap: 24,
    },
    sideColumn: {
      flex: 1,
      gap: 24,
      maxWidth: isDesktop ? 400 : undefined,
    },
    twoColumnRow: {
      flexDirection: isDesktop || isTablet ? 'row' : 'column',
      gap: 24,
    },
    card: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: isDesktop ? 24 : 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#111',
      marginBottom: 16,
    },
    // Table styles
    table: {
      borderRadius: 8,
      overflow: 'hidden',
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#f9fafb',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
    },
    tableHeaderCell: {
      flex: 1,
      fontSize: 11,
      fontWeight: '600',
      color: '#6b7280',
      textTransform: 'uppercase',
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
      alignItems: 'center',
    },
    tableCell: {
      flex: 1,
      fontSize: 13,
      color: '#374151',
    },
    tableCellPrimary: {
      fontSize: 13,
      fontWeight: '600',
      color: '#111',
    },
    tableCellSecondary: {
      fontSize: 11,
      color: '#9ca3af',
      marginTop: 2,
    },
    rateBar: {
      height: 6,
      backgroundColor: '#e5e7eb',
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 4,
    },
    rateBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    rateText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#374151',
    },
    // Mini stats
    miniStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
    },
    miniStatItem: {
      flex: 1,
      minWidth: 80,
    },
    miniStatValue: {
      fontSize: 20,
      fontWeight: '700',
      color: '#111',
    },
    miniStatLabel: {
      fontSize: 11,
      color: '#666',
      marginTop: 2,
    },
    noteText: {
      fontSize: 11,
      color: '#666',
      fontStyle: 'italic',
      marginTop: 12,
    },
    abandonmentNote: {
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#f0f0f0',
    },
  });
}

export default styles;
