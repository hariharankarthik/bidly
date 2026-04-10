-- Update get_match_display_names to also return match_date for chronological sorting.
CREATE OR REPLACE FUNCTION get_match_display_names(p_match_ids TEXT[])
RETURNS TABLE(match_id TEXT, display_name TEXT, match_date TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cst.match_id,
    CASE
      WHEN cst.teams IS NOT NULL
        AND array_length(cst.teams, 1) >= 2
        AND cst.teams[1] IS NOT NULL
        AND cst.teams[2] IS NOT NULL
        THEN cst.teams[1] || ' vs ' || cst.teams[2]
      ELSE cst.match_id
    END AS display_name,
    cst.match_date::TEXT AS match_date
  FROM cricket_sync_tracker cst
  WHERE cst.match_id = ANY(p_match_ids);
$$;
