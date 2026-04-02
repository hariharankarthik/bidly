import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    league_id?: string;
    offered_player_id?: string;
    requested_player_id?: string;
  };

  const { league_id, offered_player_id, requested_player_id } = body;
  if (!league_id || !offered_player_id || !requested_player_id) {
    return NextResponse.json({ error: "league_id, offered_player_id, and requested_player_id are required" }, { status: 400 });
  }

  // Verify league is active
  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("id, status, league_kind")
    .eq("id", league_id)
    .single();
  if (!league || league.league_kind !== "private") {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }
  if (league.status !== "active") {
    return NextResponse.json({ error: "Pickups are only allowed in active leagues" }, { status: 400 });
  }

  // Get my team
  const { data: myTeam } = await supabase
    .from("private_league_teams")
    .select("id, squad_player_ids, claimed_by")
    .eq("league_id", league_id)
    .eq("claimed_by", user.id)
    .single();
  if (!myTeam) {
    return NextResponse.json({ error: "You don't have a team in this league" }, { status: 403 });
  }

  const mySquad = (myTeam.squad_player_ids as string[]) ?? [];
  if (!mySquad.includes(offered_player_id)) {
    return NextResponse.json({ error: "Player to drop is not on your squad" }, { status: 400 });
  }

  // Insert trade row with NULL recipient (free agent pickup), then execute atomically
  // The execute_pickup DB function handles the free-agent check under lock
  const { data: trade, error: insertErr } = await supabase
    .from("private_league_trades")
    .insert({
      league_id,
      proposer_team_id: myTeam.id,
      recipient_team_id: null,
      offered_player_id,
      requested_player_id,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: "One of these players is already in a pending trade" }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Execute the pickup instantly
  const { data: result, error: rpcErr } = await supabase.rpc("execute_pickup", {
    p_trade_id: trade.id,
    p_user_id: user.id,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const rpcResult = result as { error?: string; success?: boolean };
  if (rpcResult?.error) {
    return NextResponse.json({ error: rpcResult.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, trade_id: trade.id });
}
