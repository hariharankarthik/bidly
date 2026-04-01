-- Store offline draft purchase prices for private league squads.
-- Used for auto XI + auto C/VC selection when not manually set.

ALTER TABLE private_league_teams
  ADD COLUMN IF NOT EXISTS squad_player_prices JSONB NOT NULL DEFAULT '{}'::jsonb;

