import { createClient } from "@/lib/supabase/server";
import { getSportConfig } from "@/lib/sports";
import { scorePlayerMatch, type PlayerMatchStats } from "@/lib/fantasy-scoring";
import { NextRequest, NextResponse } from "next/server";

type PerformanceInput = {
  player_id: string;
} & PlayerMatchStats;

function mergeBreakdown(into: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) {
    into[k] = (into[k] ?? 0) + v;
  }
}

/**
 * Host-only. Two modes:
 * 1) Default: mock points per team (MVP smoke test).
 * 2) `performances`: array of { player_id, batting?, bowling?, fielding? } — uses auctionroom-style engine;
 *    sums points per `auction_teams` using sold `auction_results` (player → team).
 *
 * CricAPI / external feed: map scorecard → `performances`, then POST here (or call from a server cron).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    league_id?: string;
    match_id?: string;
    match_date?: string;
    performances?: PerformanceInput[];
  };
  const { league_id, match_id, match_date, performances } = body;
  if (!league_id || !match_id || !match_date) {
    return NextResponse.json({ error: "league_id, match_id, match_date required" }, { status: 400 });
  }

  const { data: league, error: lErr } = await supabase
    .from("fantasy_leagues")
    .select("id, room_id, sport_id")
    .eq("id", league_id)
    .single();

  if (lErr || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });

  const { data: room } = await supabase.from("auction_rooms").select("host_id").eq("id", league.room_id).single();
  if (!room || room.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: teams } = await supabase.from("auction_teams").select("id").eq("room_id", league.room_id);
  const teamList = teams ?? [];

  if (Array.isArray(performances) && performances.length > 0) {
    const { data: soldRows, error: srErr } = await supabase
      .from("auction_results")
      .select("player_id, team_id")
      .eq("room_id", league.room_id)
      .eq("is_unsold", false);

    if (srErr) return NextResponse.json({ error: srErr.message }, { status: 500 });

    const playerToTeam = new Map<string, string>();
    for (const r of soldRows ?? []) {
      if (r.player_id && r.team_id) playerToTeam.set(r.player_id, r.team_id);
    }

    const agg = new Map<string, { total: number; breakdown: Record<string, number> }>();
    for (const t of teamList) {
      agg.set(t.id, { total: 0, breakdown: {} });
    }

    let applied = 0;
    for (const row of performances) {
      if (!row.player_id || typeof row.player_id !== "string") continue;
      const teamId = playerToTeam.get(row.player_id);
      if (!teamId) continue;

      const stats: PlayerMatchStats = {
        batting: row.batting,
        bowling: row.bowling,
        fielding: row.fielding,
      };
      if (!stats.batting && !stats.bowling && !stats.fielding) continue;

      const { total, breakdown } = scorePlayerMatch(stats);
      const bucket = agg.get(teamId);
      if (!bucket) continue;
      bucket.total += total;
      mergeBreakdown(bucket.breakdown, breakdown);
      applied++;
    }

    const rows = teamList.map((t) => {
      const b = agg.get(t.id)!;
      return {
        league_id,
        team_id: t.id,
        match_id: String(match_id),
        match_date,
        total_points: Math.round(b.total * 100) / 100,
        breakdown: { ...b.breakdown, source: "engine_v1", performances_applied: applied },
      };
    });

    const { error } = await supabase.from("fantasy_scores").upsert(rows, {
      onConflict: "league_id,team_id,match_id",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, updated: rows.length, mode: "performances", performances_applied: applied });
  }

  const scoring = getSportConfig(league.sport_id)?.scoring ?? [];
  const playingXi = scoring.find((s) => s.action === "playing_xi");

  const rows = teamList.map((t, i) => {
    const base = 20 + (i + 1) * 3 + (match_id.length % 7);
    const breakdown = {
      mock: base,
      playing_xi: playingXi?.points ?? 0,
      source: "mock",
    };
    const total = base + (playingXi?.points ?? 0);
    return {
      league_id,
      team_id: t.id,
      match_id: String(match_id),
      match_date,
      total_points: total,
      breakdown,
    };
  });

  const { error } = await supabase.from("fantasy_scores").upsert(rows, {
    onConflict: "league_id,team_id,match_id",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, updated: rows.length, mode: "mock" });
}
