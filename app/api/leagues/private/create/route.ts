import { createClient } from "@/lib/supabase/server";
import { getSportConfig } from "@/lib/sports";
import { generateInviteCode } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { name?: string; sport_id?: string };
  const name = body.name?.trim();
  const sport_id = body.sport_id?.trim();
  if (!name || !sport_id) {
    return NextResponse.json({ error: "name and sport_id required" }, { status: 400 });
  }
  if (!getSportConfig(sport_id)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 400 });
  }

  let invite_code = generateInviteCode(6);
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: clash } = await supabase
      .from("fantasy_leagues")
      .select("id")
      .eq("invite_code", invite_code)
      .maybeSingle();
    if (!clash) break;
    invite_code = generateInviteCode(6);
  }

  const { data: league, error } = await supabase
    .from("fantasy_leagues")
    .insert({
      host_id: user.id,
      name,
      sport_id,
      league_kind: "private",
      status: "active",
      invite_code,
      room_id: null,
    })
    .select("id, invite_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ league_id: league.id, invite_code: league.invite_code });
}
