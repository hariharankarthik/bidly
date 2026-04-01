-- Atomic unclaim for private league teams.
-- Prevents TOCTOU race where league status can change between read and update.

DO $do$
BEGIN
  CREATE OR REPLACE FUNCTION public.unclaim_private_team_atomic(
    p_league_id UUID,
    p_team_id UUID,
    p_user_id UUID
  )
  RETURNS TEXT
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_updated INTEGER := 0;
    v_league_kind TEXT;
    v_league_status TEXT;
  BEGIN
    UPDATE private_league_teams t
    SET claimed_by = NULL
    WHERE t.id = p_team_id
      AND t.league_id = p_league_id
      AND t.claimed_by = p_user_id
      AND EXISTS (
        SELECT 1
        FROM fantasy_leagues fl
        WHERE fl.id = t.league_id
          AND fl.league_kind = 'private'
          AND fl.status = 'draft'
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 1 THEN
      RETURN 'ok';
    END IF;

    SELECT fl.league_kind, fl.status
    INTO v_league_kind, v_league_status
    FROM fantasy_leagues fl
    WHERE fl.id = p_league_id;

    IF NOT FOUND THEN
      RETURN 'league_not_found';
    END IF;

    IF v_league_kind <> 'private' THEN
      RETURN 'not_private';
    END IF;

    IF v_league_status <> 'draft' THEN
      RETURN 'not_draft';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM private_league_teams t
      WHERE t.id = p_team_id
        AND t.league_id = p_league_id
    ) THEN
      RETURN 'team_not_found';
    END IF;

    RETURN 'not_owner';
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.unclaim_private_team_atomic(UUID, UUID, UUID) TO authenticated;
END;
$do$;
