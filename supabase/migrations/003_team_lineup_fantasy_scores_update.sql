-- Starting XI, captain & vice-captain; host may UPDATE fantasy_scores (upsert conflicts).

ALTER TABLE auction_teams
  ADD COLUMN IF NOT EXISTS starting_xi_player_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS captain_player_id UUID REFERENCES players (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vice_captain_player_id UUID REFERENCES players (id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Host can update fantasy scores" ON fantasy_scores;
CREATE POLICY "Host can update fantasy scores" ON fantasy_scores FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM fantasy_leagues fl
    JOIN auction_rooms ar ON ar.id = fl.room_id
    WHERE fl.id = league_id AND ar.host_id = auth.uid()
  )
);
