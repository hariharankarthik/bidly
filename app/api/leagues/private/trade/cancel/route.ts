import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { trade_id?: string };
  const { trade_id } = body;
  if (!trade_id) return NextResponse.json({ error: "trade_id required" }, { status: 400 });

  // Fetch the trade
  const { data: trade } = await supabase
    .from("private_league_trades")
    .select("id, proposer_team_id, status")
    .eq("id", trade_id)
    .single();

  if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  if (trade.status !== "pending") {
    return NextResponse.json({ error: "Trade is no longer pending" }, { status: 400 });
  }

  // Verify user owns the proposer team
  const { data: proposerTeam } = await supabase
    .from("private_league_teams")
    .select("id, claimed_by")
    .eq("id", trade.proposer_team_id)
    .single();
  if (!proposerTeam || proposerTeam.claimed_by !== user.id) {
    return NextResponse.json({ error: "Only the proposer can cancel this trade" }, { status: 403 });
  }

  const { error: updateErr } = await supabase
    .from("private_league_trades")
    .update({
      status: "cancelled",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", trade_id)
    .eq("status", "pending");

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
