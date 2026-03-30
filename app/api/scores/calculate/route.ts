import { createClient } from "@/lib/supabase/server";
import { getSportConfig } from "@/lib/sports";
import {
  scorePlayerMatch,
  type PlayerMatchStats,
} from "@/lib/fantasy-scoring";
import { effectivePointsWithLineup } from "@/lib/fantasy-scoring/lineup-multipliers";
import {
  extractPerformancesFromCricApiJson,
  fetchCricApiScorecardJson,
  mergeBowlingFromCricApiJson,
  normalizeName,
} from "@/lib/cricapi/fetch-scorecard";
import { NextRequest, NextResponse } from "next/server";

type PerformanceInput = {
  player_id: string;
} & PlayerMatchStats;

type TeamLineupRow = {
  id: string;
  starting_xi_player_ids: string[] | null;
  captain_player_id: string | null;
  vice_captain_player_id: string | null;
};

async function mapCricApiNamesToPerformances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sportId: string,
  rows: { playerName: string; stats: PlayerMatchStats }[],
): Promise<{ performances: PerformanceInput[]; unmatched: string[] }> {
  const { data: players, error } = await supabase.from("players").select("id, name").eq("sport_id", sportId);
  if (error) throw new Error(error.message);
  const list = players ?? [];
  const performances: PerformanceInput[] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    const key = normalizeName(row.playerName);
    const exact = list.find((p) => normalizeName(p.name) === key);
    const fuzzy =
      exact ??
      list.find(
        (p) =>
          key.length >= 4 &&
          (normalizeName(p.name).includes(key) || key.includes(normalizeName(p.name))),
      );
    if (!fuzzy) {
      unmatched.push(row.playerName);
      continue;
    }
    performances.push({ player_id: fuzzy.id, ...row.stats });
  }

  return { performances, unmatched };
}

/**
 * Host-only.
 * - Default: mock points per team.
 * - `performances`: manual stats per `player_id`.
 * - `cricapi_match_id`: server fetches CricAPI scorecard (needs CRICAPI_KEY), maps names → DB players.
 *
 * Starting XI: if a team sets `starting_xi_player_ids`, only those players count; substitutes → 0.
 * If XI is empty, all squad players with stats count. Captain 2×, vice-captain 1.5× on effective points.
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
    cricapi_match_id?: string;
  };
  const { league_id, match_id, match_date } = body;
  let { performances } = body;
  const { cricapi_match_id } = body;

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

  const { data: teams, error: tmErr } = await supabase
    .from("auction_teams")
    .select("id, starting_xi_player_ids, captain_player_id, vice_captain_player_id")
    .eq("room_id", league.room_id);

  if (tmErr) return NextResponse.json({ error: tmErr.message }, { status: 500 });
  const teamList = (teams ?? []) as TeamLineupRow[];

  let unmatchedNames: string[] | undefined;
  let cricapiUsed = false;

  if (cricapi_match_id && String(cricapi_match_id).trim()) {
    cricapiUsed = true;
    try {
      const raw = await fetchCricApiScorecardJson(String(cricapi_match_id).trim());
      let extracted = extractPerformancesFromCricApiJson(raw);
      extracted = mergeBowlingFromCricApiJson(extracted, raw);
      const mapped = await mapCricApiNamesToPerformances(supabase, league.sport_id, extracted);
      performances = mapped.performances;
      unmatchedNames = mapped.unmatched.length ? mapped.unmatched : undefined;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "CricAPI fetch failed" },
        { status: 502 },
      );
    }
  }

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

    const lineupByTeam = new Map<string, TeamLineupRow>();
    for (const t of teamList) lineupByTeam.set(t.id, t);

    const agg = new Map<string, { total: number; breakdown: Record<string, number>; detail: object[] }>();
    for (const t of teamList) {
      agg.set(t.id, { total: 0, breakdown: {}, detail: [] });
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

      const { total: baseTotal } = scorePlayerMatch(stats);
      const teamRow = lineupByTeam.get(teamId);
      const xi = teamRow?.starting_xi_player_ids ?? [];
      const { effective, counted, multiplier } = effectivePointsWithLineup(baseTotal, row.player_id, {
        startingXiPlayerIds: xi.filter(Boolean),
        captainPlayerId: teamRow?.captain_player_id ?? null,
        viceCaptainPlayerId: teamRow?.vice_captain_player_id ?? null,
      });

      if (!counted) continue;

      const bucket = agg.get(teamId);
      if (!bucket) continue;
      bucket.total += effective;
      bucket.detail.push({
        player_id: row.player_id,
        base_points: baseTotal,
        multiplier,
        effective_points: effective,
      });
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
        breakdown: {
          ...b.breakdown,
          source: cricapiUsed ? "cricapi_v1" : "engine_v1",
          performances_applied: applied,
          player_lines: b.detail.slice(0, 40),
          ...(unmatchedNames?.length ? { cricapi_unmatched_names: unmatchedNames } : {}),
        },
      };
    });

    const { error } = await supabase.from("fantasy_scores").upsert(rows, {
      onConflict: "league_id,team_id,match_id",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      updated: rows.length,
      mode: cricapiUsed ? "cricapi" : "performances",
      performances_applied: applied,
      ...(unmatchedNames?.length ? { unmatched_names: unmatchedNames } : {}),
    });
  }

  if (cricapiUsed) {
    return NextResponse.json(
      { error: "CricAPI returned no mappable players — check names vs your player pool or CRICAPI_KEY." },
      { status: 400 },
    );
  }

  const scoring = getSportConfig(league.sport_id)?.scoring ?? [];
  const playingXi = scoring.find((s) => s.action === "playing_xi");

  const mockRows = teamList.map((t, i) => {
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

  const { error } = await supabase.from("fantasy_scores").upsert(mockRows, {
    onConflict: "league_id,team_id,match_id",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, updated: mockRows.length, mode: "mock" });
}
