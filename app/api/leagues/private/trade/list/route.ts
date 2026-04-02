import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league_id = req.nextUrl.searchParams.get("league_id");
  if (!league_id) return NextResponse.json({ error: "league_id required" }, { status: 400 });

  // Verify user is a league member
  const { data: myTeam } = await supabase
    .from("private_league_teams")
    .select("id, claimed_by")
    .eq("league_id", league_id)
    .eq("claimed_by", user.id)
    .single();
  if (!myTeam) return NextResponse.json({ error: "You are not a member of this league" }, { status: 403 });

  // Fetch all trades with player and team details
  const { data: trades, error } = await supabase
    .from("private_league_trades")
    .select(`
      id,
      league_id,
      proposer_team_id,
      recipient_team_id,
      offered_player_id,
      requested_player_id,
      status,
      resolved_by,
      created_at,
      resolved_at
    `)
    .eq("league_id", league_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trades: trades ?? [] });
}
