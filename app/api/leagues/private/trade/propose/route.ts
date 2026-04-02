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
    recipient_team_id?: string;
    offered_player_id?: string;
    requested_player_id?: string;
  };

  const { league_id, recipient_team_id, offered_player_id, requested_player_id } = body;
  if (!league_id || !recipient_team_id || !offered_player_id || !requested_player_id) {
    return NextResponse.json({ error: "league_id, recipient_team_id, offered_player_id, and requested_player_id are required" }, { status: 400 });
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
    return NextResponse.json({ error: "Trades are only allowed in active leagues" }, { status: 400 });
  }

  // Get proposer's team (must be claimed by this user)
  const { data: myTeam } = await supabase
    .from("private_league_teams")
    .select("id, squad_player_ids, claimed_by")
    .eq("league_id", league_id)
    .eq("claimed_by", user.id)
    .single();
  if (!myTeam) {
    return NextResponse.json({ error: "You don't have a team in this league" }, { status: 403 });
  }

  // Can't trade with yourself
  if (myTeam.id === recipient_team_id) {
    return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
  }

  // Verify offered player is in my squad
  const mySquad = (myTeam.squad_player_ids as string[]) ?? [];
  if (!mySquad.includes(offered_player_id)) {
    return NextResponse.json({ error: "Offered player is not on your squad" }, { status: 400 });
  }

  // Verify recipient team exists and requested player is on their squad
  const { data: recipientTeam } = await supabase
    .from("private_league_teams")
    .select("id, squad_player_ids")
    .eq("id", recipient_team_id)
    .eq("league_id", league_id)
    .single();
  if (!recipientTeam) {
    return NextResponse.json({ error: "Recipient team not found" }, { status: 404 });
  }
  const recipSquad = (recipientTeam.squad_player_ids as string[]) ?? [];
  if (!recipSquad.includes(requested_player_id)) {
    return NextResponse.json({ error: "Requested player is not on the recipient's squad" }, { status: 400 });
  }

  // Insert the trade (DB unique index prevents duplicate pending trades for same player)
  const { data: trade, error: insertErr } = await supabase
    .from("private_league_trades")
    .insert({
      league_id,
      proposer_team_id: myTeam.id,
      recipient_team_id,
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

  return NextResponse.json({ success: true, trade_id: trade.id });
}
