-- ============================================================
-- 014: Player Trading System
-- Supports user-to-user trades and free agent pickups
-- ============================================================

-- 1. Trades table
CREATE TABLE IF NOT EXISTS private_league_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES fantasy_leagues(id) ON DELETE CASCADE,
  proposer_team_id UUID NOT NULL REFERENCES private_league_teams(id) ON DELETE CASCADE,
  recipient_team_id UUID REFERENCES private_league_teams(id) ON DELETE CASCADE,
  -- NULL recipient_team_id = free agent pickup
  offered_player_id UUID NOT NULL REFERENCES players(id),
  requested_player_id UUID NOT NULL REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_trades_league_status
  ON private_league_trades(league_id, status);

CREATE INDEX IF NOT EXISTS idx_trades_proposer
  ON private_league_trades(proposer_team_id, status);

CREATE INDEX IF NOT EXISTS idx_trades_recipient
  ON private_league_trades(recipient_team_id, status);

-- Prevent a player from being in multiple pending trades at once
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_pending_offered
  ON private_league_trades(league_id, offered_player_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_pending_requested
  ON private_league_trades(league_id, requested_player_id)
  WHERE status = 'pending';

-- 3. RLS
ALTER TABLE private_league_trades ENABLE ROW LEVEL SECURITY;

-- All league members can view trades
CREATE POLICY "League members can view trades"
  ON private_league_trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM private_league_teams plt
      WHERE plt.league_id = private_league_trades.league_id
        AND plt.claimed_by = auth.uid()
    )
  );

-- Authenticated users can propose trades for their own team
CREATE POLICY "Users can propose trades for own team"
  ON private_league_trades FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM private_league_teams plt
      WHERE plt.id = proposer_team_id
        AND plt.claimed_by = auth.uid()
    )
  );

-- Recipient can accept/reject; proposer can cancel
CREATE POLICY "Trade participants can update trades"
  ON private_league_trades FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM private_league_teams plt
      WHERE (plt.id = proposer_team_id OR plt.id = recipient_team_id)
        AND plt.claimed_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM private_league_teams plt
      WHERE (plt.id = proposer_team_id OR plt.id = recipient_team_id)
        AND plt.claimed_by = auth.uid()
    )
  );

-- 4. Atomic trade execution function (user-to-user)
CREATE OR REPLACE FUNCTION execute_trade(p_trade_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade private_league_trades%ROWTYPE;
  v_proposer private_league_teams%ROWTYPE;
  v_recipient private_league_teams%ROWTYPE;
BEGIN
  -- Lock the trade row
  SELECT * INTO v_trade
    FROM private_league_trades
    WHERE id = p_trade_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trade not found');
  END IF;

  IF v_trade.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Trade is no longer pending');
  END IF;

  IF v_trade.recipient_team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Use execute_pickup for free agent pickups');
  END IF;

  -- Verify the accepting user owns the recipient team
  SELECT * INTO v_recipient
    FROM private_league_teams
    WHERE id = v_trade.recipient_team_id
    FOR UPDATE;

  IF v_recipient.claimed_by != p_user_id THEN
    RETURN jsonb_build_object('error', 'Only the recipient team owner can accept');
  END IF;

  -- Lock proposer team
  SELECT * INTO v_proposer
    FROM private_league_teams
    WHERE id = v_trade.proposer_team_id
    FOR UPDATE;

  -- Verify players are still on their respective squads
  IF NOT (v_trade.offered_player_id = ANY(v_proposer.squad_player_ids)) THEN
    RETURN jsonb_build_object('error', 'Offered player is no longer on proposer squad');
  END IF;

  IF NOT (v_trade.requested_player_id = ANY(v_recipient.squad_player_ids)) THEN
    RETURN jsonb_build_object('error', 'Requested player is no longer on recipient squad');
  END IF;

  -- Trade is 1-for-1 swap, squad sizes stay the same.
  -- Overseas limit is enforced at XI level, not squad level.

  -- Perform the swap on proposer team
  UPDATE private_league_teams SET
    squad_player_ids = array_remove(squad_player_ids, v_trade.offered_player_id) || v_trade.requested_player_id,
    starting_xi_player_ids = array_remove(starting_xi_player_ids, v_trade.offered_player_id),
    captain_player_id = CASE WHEN captain_player_id = v_trade.offered_player_id THEN NULL ELSE captain_player_id END,
    vice_captain_player_id = CASE WHEN vice_captain_player_id = v_trade.offered_player_id THEN NULL ELSE vice_captain_player_id END
  WHERE id = v_trade.proposer_team_id;

  -- Perform the swap on recipient team
  UPDATE private_league_teams SET
    squad_player_ids = array_remove(squad_player_ids, v_trade.requested_player_id) || v_trade.offered_player_id,
    starting_xi_player_ids = array_remove(starting_xi_player_ids, v_trade.requested_player_id),
    captain_player_id = CASE WHEN captain_player_id = v_trade.requested_player_id THEN NULL ELSE captain_player_id END,
    vice_captain_player_id = CASE WHEN vice_captain_player_id = v_trade.requested_player_id THEN NULL ELSE vice_captain_player_id END
  WHERE id = v_trade.recipient_team_id;

  -- Mark trade as accepted
  UPDATE private_league_trades SET
    status = 'accepted',
    resolved_by = p_user_id,
    resolved_at = NOW()
  WHERE id = p_trade_id;

  -- Cancel any other pending trades involving either player in this league
  UPDATE private_league_trades SET
    status = 'cancelled',
    resolved_at = NOW()
  WHERE league_id = v_trade.league_id
    AND id != p_trade_id
    AND status = 'pending'
    AND (
      offered_player_id IN (v_trade.offered_player_id, v_trade.requested_player_id)
      OR requested_player_id IN (v_trade.offered_player_id, v_trade.requested_player_id)
    );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Atomic free agent pickup function
CREATE OR REPLACE FUNCTION execute_pickup(p_trade_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade private_league_trades%ROWTYPE;
  v_team private_league_teams%ROWTYPE;
  v_already_picked BOOLEAN;
  v_max_squad INT := 15;
BEGIN
  -- Lock the trade row
  SELECT * INTO v_trade
    FROM private_league_trades
    WHERE id = p_trade_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trade not found');
  END IF;

  IF v_trade.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Pickup is no longer pending');
  END IF;

  IF v_trade.recipient_team_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'This is not a free agent pickup');
  END IF;

  -- Lock ALL teams in this league to prevent concurrent pickup races
  PERFORM id FROM private_league_teams
    WHERE league_id = v_trade.league_id
    FOR UPDATE;

  -- Re-read proposer team after acquiring locks
  SELECT * INTO v_team
    FROM private_league_teams
    WHERE id = v_trade.proposer_team_id;

  IF v_team.claimed_by != p_user_id THEN
    RETURN jsonb_build_object('error', 'Only the team owner can execute this pickup');
  END IF;

  -- Verify offered player is still on squad
  IF NOT (v_trade.offered_player_id = ANY(v_team.squad_player_ids)) THEN
    RETURN jsonb_build_object('error', 'Player to drop is no longer on your squad');
  END IF;

  -- Verify requested player is not on any squad in this league (safe under lock)
  SELECT EXISTS (
    SELECT 1 FROM private_league_teams plt
    WHERE plt.league_id = v_trade.league_id
      AND v_trade.requested_player_id = ANY(plt.squad_player_ids)
  ) INTO v_already_picked;

  IF v_already_picked THEN
    RETURN jsonb_build_object('error', 'Player has already been picked up by another team');
  END IF;

  -- Perform the swap
  UPDATE private_league_teams SET
    squad_player_ids = array_remove(squad_player_ids, v_trade.offered_player_id) || v_trade.requested_player_id,
    starting_xi_player_ids = array_remove(starting_xi_player_ids, v_trade.offered_player_id),
    captain_player_id = CASE WHEN captain_player_id = v_trade.offered_player_id THEN NULL ELSE captain_player_id END,
    vice_captain_player_id = CASE WHEN vice_captain_player_id = v_trade.offered_player_id THEN NULL ELSE vice_captain_player_id END
  WHERE id = v_trade.proposer_team_id;

  -- Mark as accepted (instant)
  UPDATE private_league_trades SET
    status = 'accepted',
    resolved_by = p_user_id,
    resolved_at = NOW()
  WHERE id = p_trade_id;

  -- Cancel any other pending trades involving the dropped player
  UPDATE private_league_trades SET
    status = 'cancelled',
    resolved_at = NOW()
  WHERE league_id = v_trade.league_id
    AND id != p_trade_id
    AND status = 'pending'
    AND (
      offered_player_id = v_trade.offered_player_id
      OR requested_player_id = v_trade.offered_player_id
    );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Atomic add-to-squad function (free agent, no drop)
CREATE OR REPLACE FUNCTION add_free_agent_to_squad(p_league_id UUID, p_team_id UUID, p_player_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team private_league_teams%ROWTYPE;
  v_already_picked BOOLEAN;
  v_max_squad INT := 15;
BEGIN
  -- Lock ALL teams in this league to prevent concurrent add races
  PERFORM id FROM private_league_teams
    WHERE league_id = p_league_id
    FOR UPDATE;

  -- Read the team after lock
  SELECT * INTO v_team
    FROM private_league_teams
    WHERE id = p_team_id AND league_id = p_league_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  IF v_team.claimed_by != p_user_id THEN
    RETURN jsonb_build_object('error', 'Only the team owner can add players');
  END IF;

  IF array_length(v_team.squad_player_ids, 1) >= v_max_squad THEN
    RETURN jsonb_build_object('error', 'Squad is already at maximum size (15)');
  END IF;

  IF p_player_id = ANY(v_team.squad_player_ids) THEN
    RETURN jsonb_build_object('error', 'Player is already on your squad');
  END IF;

  -- Check no other team has this player (safe under lock)
  SELECT EXISTS (
    SELECT 1 FROM private_league_teams plt
    WHERE plt.league_id = p_league_id
      AND p_player_id = ANY(plt.squad_player_ids)
  ) INTO v_already_picked;

  IF v_already_picked THEN
    RETURN jsonb_build_object('error', 'This player is already on a team');
  END IF;

  -- Add to squad
  UPDATE private_league_teams SET
    squad_player_ids = squad_player_ids || p_player_id
  WHERE id = p_team_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
