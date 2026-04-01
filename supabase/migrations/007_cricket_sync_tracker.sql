-- Track pending/failed/synced IPL match score sync attempts for auto-backfill.
-- This table is written by the server cron route using service-role key.

CREATE TABLE IF NOT EXISTS cricket_sync_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT UNIQUE NOT NULL,
  match_date DATE NOT NULL,
  teams TEXT[] DEFAULT '{}',
  source_preferred TEXT NOT NULL DEFAULT 'cricapi' CHECK (source_preferred IN ('cricapi')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  last_attempt_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cricket_sync_tracker_status_date
  ON cricket_sync_tracker (status, match_date);

ALTER TABLE cricket_sync_tracker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny direct access to sync tracker" ON cricket_sync_tracker;
CREATE POLICY "Deny direct access to sync tracker"
  ON cricket_sync_tracker
  FOR ALL
  USING (false)
  WITH CHECK (false);

