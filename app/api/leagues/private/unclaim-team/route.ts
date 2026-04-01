import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { league_id?: string; team_id?: string };
  const league_id = body.league_id?.trim();
  const team_id = body.team_id?.trim();
  if (!league_id || !team_id) {
    return NextResponse.json({ error: "league_id and team_id required" }, { status: 400 });
  }

  const { data: league, error: lErr } = await supabase
    .from("fantasy_leagues")
    .select("id, league_kind, status")
    .eq("id", league_id)
    .single();
  if (lErr || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.league_kind !== "private") {
    return NextResponse.json({ error: "Only private leagues support unclaiming teams" }, { status: 400 });
  }
  if (league.status !== "draft") {
    return NextResponse.json({ error: "Cannot unclaim after league has started" }, { status: 400 });
  }

  const { data: team, error: tErr } = await supabase
    .from("private_league_teams")
    .select("id, league_id, claimed_by")
    .eq("id", team_id)
    .eq("league_id", league_id)
    .single();
  if (tErr || !team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (team.claimed_by !== user.id) {
    return NextResponse.json({ error: "You haven't claimed this team" }, { status: 403 });
  }

  const { error: uErr } = await supabase
    .from("private_league_teams")
    .update({ claimed_by: null })
    .eq("id", team_id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
