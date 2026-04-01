import { createClient } from "@/lib/supabase/server";
import { getSportConfig } from "@/lib/sports";
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
    .select("id, host_id, league_kind, status, sport_id")
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

  const cfg = getSportConfig(league.sport_id);
  const xiSize = cfg?.lineup?.xiSize ?? 11;

  // Fetch all teams with squads and prices
  const { data: teams } = await supabase
    .from("private_league_teams")
    .select("id, squad_player_ids, squad_player_prices, starting_xi_player_ids, captain_player_id, vice_captain_player_id")
    .eq("league_id", league_id);

  // Fetch base_price fallback for all players across all squads
  const allPlayerIds = [...new Set((teams ?? []).flatMap((t) => (t.squad_player_ids as string[]) ?? []))];
  const priceByPlayerId = new Map<string, number>();
  if (allPlayerIds.length > 0) {
    const { data: playerRows } = await supabase
      .from("players")
      .select("id, base_price")
      .in("id", allPlayerIds);
    for (const p of playerRows ?? []) {
      priceByPlayerId.set(p.id, p.base_price ?? 0);
    }
  }

  // Auto-populate XI, Captain, VC for each team that hasn't set them yet
  const now = new Date().toISOString();
  for (const t of teams ?? []) {
    const existingXi = Array.isArray(t.starting_xi_player_ids) ? (t.starting_xi_player_ids as string[]) : [];
    if (existingXi.length > 0) continue; // Already has XI set

    const squad = ((t.squad_player_ids as string[]) ?? []).filter(Boolean);
    if (squad.length < xiSize) continue; // Not enough players

    const spent = (t.squad_player_prices as Record<string, number>) ?? {};

    // Sort by: squad_player_prices desc → base_price desc → id asc
    const sorted = squad.slice().sort((a, b) => {
      const sa = Number(spent[a] ?? 0) || 0;
      const sb = Number(spent[b] ?? 0) || 0;
      if (sb !== sa) return sb - sa;
      const pa = priceByPlayerId.get(a) ?? 0;
      const pb = priceByPlayerId.get(b) ?? 0;
      if (pb !== pa) return pb - pa;
      return a.localeCompare(b);
    });

    const autoXi = sorted.slice(0, xiSize);
    const captainId = autoXi[0] ?? null;
    const vcId = autoXi[1] ?? null;

    // Conditional update: only set if XI is still empty (prevents overwriting concurrent manual saves)
    const { error: tErr } = await supabase
      .from("private_league_teams")
      .update({
        starting_xi_player_ids: autoXi,
        captain_player_id: captainId,
        vice_captain_player_id: vcId,
        xi_confirmed_at: now,
      })
      .eq("id", t.id)
      .eq("starting_xi_player_ids", "{}");

    if (tErr) {
      return NextResponse.json({ error: `Failed to auto-populate XI for team: ${tErr.message}` }, { status: 500 });
    }
  }

  const { error: uErr } = await supabase
    .from("fantasy_leagues")
    .update({ status: "active", started_at: now })
    .eq("id", league_id)
    .eq("status", "draft");
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
