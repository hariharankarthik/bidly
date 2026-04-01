-- Migration 010: Add started_at to fantasy_leagues and xi_confirmed_at to private_league_teams
--
-- started_at: set when host starts the league (draft → active).
--   Leagues without started_at are legacy and keep backward-compat scoring.
--
-- xi_confirmed_at: set on first lineup save, never cleared.
--   Used by cron to gate scoring — all claimed teams must have confirmed XI at least once.

ALTER TABLE fantasy_leagues
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE private_league_teams
  ADD COLUMN IF NOT EXISTS xi_confirmed_at TIMESTAMPTZ;
