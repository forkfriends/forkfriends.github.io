-- Migration: Clean up pre-hashing tokens
-- 
-- This migration clears existing sessions and exchange tokens because:
-- 1. We now store SHA-256 hashes of tokens instead of raw tokens
-- 2. Existing raw tokens cannot be validated with the new hashing logic
-- 3. Users will need to re-login after this migration
--
-- This is a one-time cleanup to enable the security improvement of
-- never storing raw session tokens in the database.

-- Delete all existing sessions (users will need to re-login)
DELETE FROM user_sessions;

-- Delete all existing exchange tokens (these are short-lived anyway)
DELETE FROM exchange_tokens;
