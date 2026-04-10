-- Atomic increment for cricket_sync_tracker.attempts
-- Avoids race conditions when cron runs concurrently with manual triggers
CREATE OR REPLACE FUNCTION increment_sync_attempts(p_match_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE cricket_sync_tracker
  SET attempts = COALESCE(attempts, 0) + 1
  WHERE match_id = p_match_id;
$$;

GRANT EXECUTE ON FUNCTION increment_sync_attempts(TEXT) TO authenticated, service_role;
