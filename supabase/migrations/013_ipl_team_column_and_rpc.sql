-- Add ipl_team column so we can group free agents by IPL franchise.
ALTER TABLE players ADD COLUMN IF NOT EXISTS ipl_team TEXT;

-- Update free-agents RPC:
--   1. Also exclude by normalized name (covers seed ↔ import UUID mismatches)
--   2. Return ipl_team column
CREATE OR REPLACE FUNCTION get_free_agents(p_sport_id TEXT, p_excluded_ids UUID[])
RETURNS TABLE(id UUID, name TEXT, role TEXT, nationality TEXT, is_overseas BOOLEAN, base_price INTEGER, ipl_team TEXT)
LANGUAGE SQL STABLE
AS $$
  SELECT p.id, p.name, p.role, p.nationality, p.is_overseas, p.base_price, p.ipl_team
  FROM players p
  WHERE p.sport_id = p_sport_id
    AND p.id != ALL(p_excluded_ids)
    AND lower(trim(p.name)) NOT IN (
      SELECT lower(trim(ep.name))
      FROM players ep
      WHERE ep.id = ANY(p_excluded_ids)
    )
  ORDER BY p.ipl_team, p.base_price DESC;
$$;
