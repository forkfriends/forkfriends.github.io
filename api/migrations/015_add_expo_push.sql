-- Add Expo push token support for native apps
-- Expo tokens are stored alongside web push subscriptions

ALTER TABLE push_subscriptions ADD COLUMN expo_token TEXT;

-- Index for efficient lookups by expo token
CREATE INDEX IF NOT EXISTS idx_push_expo_token ON push_subscriptions(expo_token) WHERE expo_token IS NOT NULL;

-- Note: For native apps, endpoint/p256dh/auth will be NULL and expo_token will be set
-- For web apps, expo_token will be NULL and endpoint/p256dh/auth will be set
