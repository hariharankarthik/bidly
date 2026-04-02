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
    player_id?: string;
  };

  const { league_id, player_id } = body;
  if (!league_id || !player_id) {
    return NextResponse.json({ error: "league_id and player_id are required" }, { status: 400 });
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
    return NextResponse.json({ error: "Adding players is only allowed in active leagues" }, { status: 400 });
  }

  // Get my team ID
  const { data: myTeam } = await supabase
    .from("private_league_teams")
    .select("id")
    .eq("league_id", league_id)
    .eq("claimed_by", user.id)
    .single();
  if (!myTeam) {
    return NextResponse.json({ error: "You don't have a team in this league" }, { status: 403 });
  }

  // Verify player exists
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("id", player_id)
    .single();
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Use atomic DB function (locks all teams to prevent races)
  const { data: result, error: rpcErr } = await supabase.rpc("add_free_agent_to_squad", {
    p_league_id: league_id,
    p_team_id: myTeam.id,
    p_player_id: player_id,
    p_user_id: user.id,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const rpcResult = result as { error?: string; success?: boolean };
  if (rpcResult?.error) {
    return NextResponse.json({ error: rpcResult.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
