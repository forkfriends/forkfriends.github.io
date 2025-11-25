# Analytics API Reference

QueueUp provides comprehensive analytics endpoints for understanding queue performance, guest behavior, and operational patterns. All endpoints are available under `/api/analytics`.

## Authentication

Analytics endpoints are currently open for read access. Future versions may require host authentication.

## Core Analytics Endpoint

### GET `/api/analytics`

Returns comprehensive analytics data for the specified time period.

**Query Parameters:**

- `days` (optional): Number of days to query (default: 7)

**Response:**

```json
{
  "period": {
    "days": 7,
    "since": "2024-01-01T00:00:00.000Z"
  },
  "eventCounts": [...],
  "dailyEvents": [...],
  "queueStats": {...},
  "partyStats": [...],
  "pushStats": {...},
  "joinFunnel": {...},
  "platformBreakdown": [...],
  "hostActions": {...},
  "waitTimeStats": {...},
  "abandonmentStats": {...},
  "perQueueStats": [...],
  "etaAccuracyStats": {...},
  "completionByWait": [...]
}
```

### Key Metrics

#### Queue Stats

- `total_queues`: Total queues created
- `active_queues`: Currently active queues
- `closed_queues`: Closed queues

#### Party Stats

- Breakdown by status: `waiting`, `called`, `served`, `left`, `no_show`, `kicked`

#### Wait Time Stats

- `total_served`: Parties successfully served
- `avg_wait_ms`: Average wait time in milliseconds
- `min_wait_ms`/`max_wait_ms`: Wait time range

#### Abandonment Stats

- `total_left`: Parties that left voluntarily
- `avg_wait_ms_at_leave`: Average wait time when leaving
- `avg_position_at_leave`: Average position in queue when leaving
- `left_under_5min`, `left_5_to_15min`, `left_over_15min`: Breakdown by wait duration

#### ETA Accuracy Stats

- `total_with_eta`: Parties with estimated wait times
- `avg_error_ms`: Average absolute error (predicted vs actual)
- `avg_bias_ms`: Average signed error (positive = underestimate, negative = overestimate)
- `within_2min`: Predictions accurate within 2 minutes
- `within_5min`: Predictions accurate within 5 minutes

#### Completion by Wait Bucket

Shows completion rates segmented by actual wait time:

- `under_5min`, `5_to_15min`, `15_to_30min`, `over_30min`
- Each bucket includes: `total`, `served`, `left`, `no_show`

---

## CSV Export Endpoint

### GET `/api/analytics/export`

Export raw data as CSV files for external analysis.

**Query Parameters:**

- `days` (optional): Number of days to export (default: 7)
- `type` (required): One of `parties`, `events`, or `queues`

**Export Types:**

#### `parties`

Columns: `id`, `session_id`, `event_name`, `short_code`, `name`, `size`, `joined_at`, `status`, `called_at`, `completed_at`, `wait_seconds`, `estimated_wait_seconds`, `position_at_leave`, `wait_at_leave_seconds`

#### `events`

Columns: `id`, `session_id`, `party_id`, `type`, `timestamp`, `details`
Limited to 10,000 most recent events.

#### `queues`

Columns: `id`, `short_code`, `event_name`, `status`, `created_at`, `max_guests`, `location`, `contact_info`, `open_time`, `close_time`, `total_parties`, `served_count`, `left_count`, `avg_wait_seconds`

---

## Abandonment Risk Model

### GET `/api/analytics/abandonment-model`

Returns historical abandonment patterns for risk prediction.

**Response:**

```json
{
  "buckets": {
    "0-3min": { "left": 5, "served": 100, "rate": 0.047, "avgPosition": 2.1 },
    "3-5min": { "left": 12, "served": 85, "rate": 0.123, "avgPosition": 3.5 },
    "5-10min": { "left": 25, "served": 60, "rate": 0.294, "avgPosition": 5.2 },
    "10-15min": { "left": 18, "served": 30, "rate": 0.375, "avgPosition": 6.8 },
    "15-30min": { "left": 15, "served": 20, "rate": 0.428, "avgPosition": 8.1 },
    "30min+": { "left": 10, "served": 5, "rate": 0.667, "avgPosition": 12.4 }
  },
  "description": "Abandonment rates by wait time bucket. Use to predict risk based on current wait."
}
```

**Usage:**
Use the `rate` field to estimate the probability a guest will leave based on their current wait time. Higher rates indicate higher risk.

---

## Throughput Forecasting

### GET `/api/analytics/throughput`

Returns patterns and forecasting data for capacity planning.

**Response:**

```json
{
  "hourlyPattern": [
    { "hour": 9, "total_parties": 45, "served": 40, "avg_wait_seconds": 180 },
    { "hour": 10, "total_parties": 120, "served": 100, "avg_wait_seconds": 300 },
    ...
  ],
  "dailyPattern": [
    { "day_of_week": 0, "day_name": "Sunday", "total_parties": 200, "served": 180, "avg_wait_seconds": 240 },
    { "day_of_week": 1, "day_name": "Monday", "total_parties": 50, "served": 45, "avg_wait_seconds": 120 },
    ...
  ],
  "queueSizeWaitEstimates": [
    { "position_bucket": "1-3", "avg_wait_seconds": 180, "sample_count": 500 },
    { "position_bucket": "4-5", "avg_wait_seconds": 420, "sample_count": 300 },
    ...
  ],
  "topServiceRates": [
    { "session_id": "abc123", "event_name": "Weekend Pop-up", "short_code": "ABC123", "served_count": 150, "parties_per_hour": 25.5 },
    ...
  ],
  "insights": {
    "description": "Throughput patterns based on last 30 days of data",
    "usage": "Use hourlyPattern to identify peak hours, dailyPattern for staffing, queueSizeWaitEstimates for capacity planning"
  }
}
```

**Use Cases:**

- **Peak Hour Identification**: Use `hourlyPattern` to see which hours have highest demand
- **Staffing Decisions**: Use `dailyPattern` to understand weekday vs weekend patterns
- **Wait Time Estimation**: Use `queueSizeWaitEstimates` to predict wait times at different queue depths
- **Benchmarking**: Use `topServiceRates` to compare queue efficiency (parties served per hour)

---

## Dynamic ETA System

QueueUp uses a dynamic ETA model that learns from historical service times.

### How It Works

1. **Per-Queue Rolling Average**: Each queue maintains its own average service time based on recently served parties
2. **Exponentially-Weighted Average**: Recent service times are weighted more heavily than older ones
3. **Fallback Default**: Uses 3-minute default when insufficient data (< 3 samples)
4. **5-Minute Cache**: Average is recalculated every 5 minutes to balance accuracy and performance

### ETA Calculation

```
estimated_wait = position_in_queue * avg_service_time_ms
```

Where `avg_service_time_ms` is the exponentially-weighted rolling average of recent party service times.

### Monitoring ETA Accuracy

Use `etaAccuracyStats` from `/api/analytics` to monitor prediction quality:

- **avg_error_ms**: How far off predictions are on average
- **avg_bias_ms**: Whether predictions tend to over/underestimate
  - Positive bias = predictions are too short (guests wait longer than expected)
  - Negative bias = predictions are too long (guests wait less than expected)
- **within_2min / within_5min**: Percentage of predictions within acceptable ranges

---

## Abandonment Risk Score

The host queue view includes a `riskScore` (0-100) for each waiting party.

### Risk Factors

1. **Wait Time**: Longer waits increase risk based on historical abandonment patterns
2. **Nearby Status**: Parties who declared themselves "nearby" have reduced risk (they're engaged)

### Risk Score Calculation

```
base_risk = historical_abandonment_rate_for_wait_bucket * 100
risk_score = is_nearby ? base_risk * 0.5 : base_risk
```

### Using Risk Scores

- **0-30**: Low risk (green) - Party is likely to stay
- **31-60**: Medium risk (yellow) - Consider engagement or prioritization
- **61-100**: High risk (red) - Party may leave soon; consider calling them or sending a notification

---

## Database Schema

Analytics rely on the following key tables:

### `parties` table

- `estimated_wait_ms`: Predicted wait time at join (for ETA accuracy tracking)
- `wait_ms_at_leave`: Actual wait time if party left (for abandonment analysis)
- `position_at_leave`: Position in queue when party left

### `events` table

- Tracks all significant actions for funnel analysis
- Key event types: `join_started`, `join_completed`, `abandon_after_eta`, `nudge_sent`, `nudge_ack`

### `sessions` table

- Queue metadata for per-queue analysis
- Links to parties for aggregation

---

## Best Practices

### For Hosts

1. Monitor `abandonmentStats` to understand when guests leave
2. Use `completionByWait` to set realistic expectations
3. Check `etaAccuracyStats` to ensure ETA predictions are helpful

### For Analysis

1. Export CSV data for deeper analysis in spreadsheet tools
2. Compare `perQueueStats` across events to identify what works
3. Use throughput patterns for future event planning

### For Integration

1. Poll `/api/analytics` periodically for dashboard updates
2. Use abandonment model data to trigger proactive notifications
3. Combine risk scores with push notifications to reduce abandonment
