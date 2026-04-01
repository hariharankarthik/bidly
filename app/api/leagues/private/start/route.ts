import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { league_id?: string };
  const league_id = body.league_id?.trim();
  if (!league_id) {
    return NextResponse.json({ error: "league_id required" }, { status: 400 });
  }

  const { data: league, error: lErr } = await supabase
    .from("fantasy_leagues")
    .select("id, host_id, league_kind, status")
    .eq("id", league_id)
    .single();
  if (lErr || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.league_kind !== "private") {
    return NextResponse.json({ error: "Only private leagues can be started" }, { status: 400 });
  }
  if (league.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (league.status !== "draft") {
    return NextResponse.json({ error: "League has already been started" }, { status: 400 });
  }

  const { error: uErr } = await supabase
    .from("fantasy_leagues")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("id", league_id)
    .eq("status", "draft");
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
