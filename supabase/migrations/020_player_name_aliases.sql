-- Add name_aliases column for auto-corrected CricAPI spelling variations.
-- The cron auto-saves aliases when Levenshtein fuzzy matching resolves a name.
-- Future matches use alias lookup (instant, no fuzzy needed).

ALTER TABLE players ADD COLUMN IF NOT EXISTS name_aliases TEXT[] DEFAULT '{}';

-- Atomically add a CricAPI name as an alias (idempotent — skips duplicates).
CREATE OR REPLACE FUNCTION add_player_name_alias(p_player_id UUID, p_alias TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE players
  SET name_aliases = array_append(name_aliases, p_alias)
  WHERE id = p_player_id
    AND NOT (p_alias = ANY(COALESCE(name_aliases, '{}')));
END;
$$;

GRANT EXECUTE ON FUNCTION add_player_name_alias(UUID, TEXT) TO authenticated, service_role;

-- Seed the known mismatch: CricAPI "Vaibhav Sooryavanshi" → DB "Vaibhav Suryavanshi"
UPDATE players SET name_aliases = array_append(COALESCE(name_aliases, '{}'), 'Vaibhav Sooryavanshi')
WHERE name = 'Vaibhav Suryavanshi' AND NOT ('Vaibhav Sooryavanshi' = ANY(COALESCE(name_aliases, '{}')));
