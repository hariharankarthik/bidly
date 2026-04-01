-- Add 'draft' status for private leagues so hosts can set up before starting.

-- 1. Drop and recreate the status CHECK to include 'draft'.
ALTER TABLE fantasy_leagues DROP CONSTRAINT IF EXISTS fantasy_leagues_status_check;
ALTER TABLE fantasy_leagues
  ADD CONSTRAINT fantasy_leagues_status_check CHECK (status IN ('draft', 'active', 'completed'));
