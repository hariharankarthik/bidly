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

  const { data: outcome, error: rpcErr } = await supabase.rpc("unclaim_private_team_atomic", {
    p_league_id: league_id,
    p_team_id: team_id,
    p_user_id: user.id,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  switch (outcome) {
    case "ok":
      return NextResponse.json({ success: true });
    case "league_not_found":
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    case "not_private":
      return NextResponse.json({ error: "Only private leagues support unclaiming teams" }, { status: 400 });
    case "not_draft":
      return NextResponse.json({ error: "Cannot unclaim after league has started" }, { status: 400 });
    case "team_not_found":
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    case "not_owner":
      return NextResponse.json({ error: "You haven't claimed this team" }, { status: 403 });
    default:
      return NextResponse.json({ error: "Failed to unclaim team" }, { status: 500 });
  }
}
