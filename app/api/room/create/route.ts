import { createClient } from "@/lib/supabase/server";
import { getSportConfig } from "@/lib/sports";
import { generateInviteCode } from "@/lib/utils";
import { CreateRoomSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateRoomSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, sport_id, purse, timer_seconds, max_teams, bid_increments } = parsed.data;

  const config = getSportConfig(sport_id);
  if (!config) return NextResponse.json({ error: "Unknown sport" }, { status: 400 });

  const purseVal = Math.min(
    config.purse.max,
    Math.max(config.purse.min, purse ?? config.purse.default),
  );
  const timerVal = Math.min(
    config.timer.max,
    Math.max(config.timer.min, timer_seconds ?? config.timer.default),
  );
  const maxTeamsVal = Math.min(
    config.roster.maxTeams,
    Math.max(2, max_teams ?? config.roster.maxTeams),
  );
  const increments =
    Array.isArray(bid_increments) && bid_increments.length > 0
      ? bid_increments
      : config.bidIncrements;

  const mergedConfig = {
    purse: purseVal,
    timerSeconds: timerVal,
    maxTeams: maxTeamsVal,
    bidIncrements: increments,
  };

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, tier, base_price")
    .eq("sport_id", sport_id);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const tierOrder = config.tiers;
  const sorted = (players ?? []).sort((a, b) => {
    const ta = tierOrder.indexOf(String(a.tier ?? ""));
    const tb = tierOrder.indexOf(String(b.tier ?? ""));
    if (ta !== tb) return (ta === -1 ? 999 : ta) - (tb === -1 ? 999 : tb);
    return (b.base_price ?? 0) - (a.base_price ?? 0);
  });
  const queueIds = sorted.map((p) => p.id);

  if (!queueIds.length) {
    return NextResponse.json({ error: "No players seeded for this sport" }, { status: 400 });
  }

  const queue = queueIds;

  let invite_code = generateInviteCode(6);
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: existing } = await supabase
      .from("auction_rooms")
      .select("id")
      .eq("invite_code", invite_code)
      .maybeSingle();
    if (!existing) break;
    invite_code = generateInviteCode(6);
  }

  const { data: room, error } = await supabase
    .from("auction_rooms")
    .insert({
      sport_id,
      name: name.trim(),
      invite_code,
      host_id: user.id,
      status: "lobby",
      config: mergedConfig,
      player_queue: queue,
      queue_index: 0,
      current_player_id: null,
      current_bid: 0,
      current_bidder_team_id: null,
    })
    .select("id, invite_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("auction_teams").insert({
    room_id: room.id,
    owner_id: user.id,
    team_name: `${name.trim()} (Host)`,
    team_color: "#10B981",
    remaining_purse: purseVal,
  });

  return NextResponse.json({ room_id: room.id, invite_code: room.invite_code });
}
