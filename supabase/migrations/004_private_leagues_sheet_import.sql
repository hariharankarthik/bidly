-- Private fantasy leagues (no auction room), sheet-imported teams, and unified fantasy_scores upsert key.

-- ===== fantasy_leagues: optional room, host, name, kind, invite =====
ALTER TABLE fantasy_leagues
  ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES profiles (id),
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS league_kind TEXT NOT NULL DEFAULT 'auction' CHECK (league_kind IN ('auction', 'private')),
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

UPDATE fantasy_leagues fl
SET host_id = ar.host_id,
    name = COALESCE(fl.name, ar.name, 'Fantasy league')
FROM auction_rooms ar
WHERE fl.room_id = ar.id;

UPDATE fantasy_leagues
SET name = COALESCE(NULLIF(trim(name), ''), 'Fantasy league')
WHERE name IS NULL OR trim(name) = '';

UPDATE fantasy_leagues fl
SET host_id = ar.host_id
FROM auction_rooms ar
WHERE fl.host_id IS NULL AND fl.room_id = ar.id;

ALTER TABLE fantasy_leagues ALTER COLUMN host_id SET NOT NULL;
ALTER TABLE fantasy_leagues ALTER COLUMN name SET NOT NULL;

ALTER TABLE fantasy_leagues DROP CONSTRAINT IF EXISTS fantasy_leagues_room_id_key;

ALTER TABLE fantasy_leagues ALTER COLUMN room_id DROP NOT NULL;

ALTER TABLE fantasy_leagues
  ADD CONSTRAINT fantasy_leagues_room_kind_check CHECK (
    (league_kind = 'auction' AND room_id IS NOT NULL)
    OR (league_kind = 'private' AND room_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_leagues_room_id_uidx ON fantasy_leagues (room_id)
WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_leagues_invite_code_uidx ON fantasy_leagues (invite_code)
WHERE invite_code IS NOT NULL;

-- ===== private_league_teams =====
CREATE TABLE IF NOT EXISTS private_league_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  league_id UUID NOT NULL REFERENCES fantasy_leagues (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles (id),
  team_name TEXT NOT NULL,
  team_color TEXT DEFAULT '#6366f1',
  squad_player_ids UUID[] NOT NULL DEFAULT '{}',
  starting_xi_player_ids UUID[] NOT NULL DEFAULT '{}',
  captain_player_id UUID REFERENCES players (id) ON DELETE SET NULL,
  vice_captain_player_id UUID REFERENCES players (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW (),
  UNIQUE (league_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_private_teams_league ON private_league_teams (league_id);

ALTER TABLE private_league_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Private league teams viewable" ON private_league_teams;
CREATE POLICY "Private league teams viewable" ON private_league_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Host can insert private league teams" ON private_league_teams;
CREATE POLICY "Host can insert private league teams" ON private_league_teams FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fantasy_leagues fl WHERE fl.id = league_id AND fl.host_id = auth.uid ())
);

DROP POLICY IF EXISTS "Host can update private league teams" ON private_league_teams;
CREATE POLICY "Host can update private league teams" ON private_league_teams FOR UPDATE USING (
  EXISTS (SELECT 1 FROM fantasy_leagues fl WHERE fl.id = league_id AND fl.host_id = auth.uid ())
);

DROP POLICY IF EXISTS "Host can delete private league teams" ON private_league_teams;
CREATE POLICY "Host can delete private league teams" ON private_league_teams FOR DELETE USING (
  EXISTS (SELECT 1 FROM fantasy_leagues fl WHERE fl.id = league_id AND fl.host_id = auth.uid ())
);

-- ===== fantasy_scores: private team OR auction team + generated conflict key =====
ALTER TABLE fantasy_scores ADD COLUMN IF NOT EXISTS private_team_id UUID REFERENCES private_league_teams (id) ON DELETE CASCADE;

ALTER TABLE fantasy_scores ALTER COLUMN team_id DROP NOT NULL;

ALTER TABLE fantasy_scores DROP CONSTRAINT IF EXISTS fantasy_scores_league_id_team_id_match_id_key;

ALTER TABLE fantasy_scores DROP CONSTRAINT IF EXISTS fantasy_scores_team_xor;
ALTER TABLE fantasy_scores
  ADD CONSTRAINT fantasy_scores_team_xor CHECK (
    (team_id IS NOT NULL AND private_team_id IS NULL)
    OR (team_id IS NULL AND private_team_id IS NOT NULL)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fantasy_scores'
      AND column_name = 'score_team_key'
  ) THEN
    ALTER TABLE fantasy_scores ADD COLUMN score_team_key TEXT GENERATED ALWAYS AS (
      CASE
        WHEN team_id IS NOT NULL THEN 'a:' || team_id::text
        WHEN private_team_id IS NOT NULL THEN 'p:' || private_team_id::text
        ELSE NULL
      END
    ) STORED;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_scores_league_match_stkey_uidx ON fantasy_scores (league_id, match_id, score_team_key);

-- ===== RLS: fantasy_leagues + fantasy_scores (host = league.host_id) =====
DROP POLICY IF EXISTS "Host can insert fantasy league" ON fantasy_leagues;
CREATE POLICY "Host can insert fantasy league" ON fantasy_leagues FOR INSERT WITH CHECK (
  auth.uid() = host_id
  AND (
    (
      league_kind = 'auction'
      AND room_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auction_rooms r WHERE r.id = room_id AND r.host_id = auth.uid ())
    )
    OR (league_kind = 'private' AND room_id IS NULL)
  )
);

DROP POLICY IF EXISTS "Host can update fantasy league" ON fantasy_leagues;
CREATE POLICY "Host can update fantasy league" ON fantasy_leagues FOR UPDATE USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "Host can insert fantasy scores" ON fantasy_scores;
CREATE POLICY "Host can insert fantasy scores" ON fantasy_scores FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fantasy_leagues fl WHERE fl.id = league_id AND fl.host_id = auth.uid ())
);

DROP POLICY IF EXISTS "Host can update fantasy scores" ON fantasy_scores;
CREATE POLICY "Host can update fantasy scores" ON fantasy_scores FOR UPDATE USING (
  EXISTS (SELECT 1 FROM fantasy_leagues fl WHERE fl.id = league_id AND fl.host_id = auth.uid ())
);
