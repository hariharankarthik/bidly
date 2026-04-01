-- Allow league host to delete private leagues (teams/scores cascade from existing FKs).
DROP POLICY IF EXISTS "Host can delete private fantasy league" ON fantasy_leagues;
CREATE POLICY "Host can delete private fantasy league" ON fantasy_leagues
FOR DELETE
USING (auth.uid() = host_id AND league_kind = 'private');
