import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    trade_id?: string;
    action?: "accept" | "reject";
  };

  const { trade_id, action } = body;
  if (!trade_id || !action || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "trade_id and action (accept/reject) are required" }, { status: 400 });
  }

  // Fetch the trade
  const { data: trade } = await supabase
    .from("private_league_trades")
    .select("id, league_id, proposer_team_id, recipient_team_id, status")
    .eq("id", trade_id)
    .single();

  if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  if (trade.status !== "pending") {
    return NextResponse.json({ error: "Trade is no longer pending" }, { status: 400 });
  }
  if (!trade.recipient_team_id) {
    return NextResponse.json({ error: "Free agent pickups cannot be accepted/rejected" }, { status: 400 });
  }

  // Verify league is still active
  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("id, status")
    .eq("id", trade.league_id)
    .single();
  if (!league || league.status !== "active") {
    return NextResponse.json({ error: "League is no longer active" }, { status: 400 });
  }

  // Verify user owns the recipient team
  const { data: recipientTeam } = await supabase
    .from("private_league_teams")
    .select("id, claimed_by")
    .eq("id", trade.recipient_team_id)
    .single();
  if (!recipientTeam || recipientTeam.claimed_by !== user.id) {
    return NextResponse.json({ error: "Only the recipient team owner can respond to this trade" }, { status: 403 });
  }

  if (action === "reject") {
    const { error: updateErr } = await supabase
      .from("private_league_trades")
      .update({
        status: "rejected",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", trade_id)
      .eq("status", "pending");

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Accept: use atomic DB function
  const { data: result, error: rpcErr } = await supabase.rpc("execute_trade", {
    p_trade_id: trade_id,
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
