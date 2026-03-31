import { createClient } from "@/lib/supabase/server";
import { validateBid } from "@/lib/auction-engine";
import { getSportConfig } from "@/lib/sports";
import { BidSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BidSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { room_id, team_id, bid_amount } = parsed.data;

  const [{ data: room, error: rErr }, { data: team, error: tErr }] = await Promise.all([
    supabase.from("auction_rooms").select("*").eq("id", room_id).single(),
    supabase.from("auction_teams").select("*").eq("id", team_id).single(),
  ]);

  if (rErr || !room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (tErr || !team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "Auction not live" }, { status: 400 });
  }
  if (team.owner_id !== user.id) {
    return NextResponse.json({ error: "Not your team" }, { status: 403 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", room.current_player_id)
    .single();

  const config = getSportConfig(room.sport_id);
  if (!config) return NextResponse.json({ error: "Sport config missing" }, { status: 500 });

  const validation = validateBid(bid_amount, room.current_bid, team, player, config);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { error: bidErr } = await supabase.from("bids").insert({
    room_id,
    player_id: room.current_player_id,
    team_id,
    amount: bid_amount,
  });
  if (bidErr) return NextResponse.json({ error: bidErr.message }, { status: 500 });

  const { error: upErr } = await supabase
    .from("auction_rooms")
    .update({
      current_bid: bid_amount,
      current_bidder_team_id: team_id,
    })
    .eq("id", room_id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ success: true, bid_amount });
}
