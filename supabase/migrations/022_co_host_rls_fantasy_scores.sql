-- Update RLS policies on fantasy_scores to allow co-hosts to insert/update scores.

DROP POLICY IF EXISTS "Host can insert fantasy scores" ON fantasy_scores;
CREATE POLICY "Host can insert fantasy scores" ON fantasy_scores FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM fantasy_leagues fl
    WHERE fl.id = league_id
      AND (fl.host_id = auth.uid() OR auth.uid() = ANY(COALESCE(fl.co_host_ids, '{}')))
  )
);

DROP POLICY IF EXISTS "Host can update fantasy scores" ON fantasy_scores;
CREATE POLICY "Host can update fantasy scores" ON fantasy_scores FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM fantasy_leagues fl
    WHERE fl.id = league_id
      AND (fl.host_id = auth.uid() OR auth.uid() = ANY(COALESCE(fl.co_host_ids, '{}')))
  )
);
