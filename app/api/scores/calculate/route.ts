import { createClient } from "@/lib/supabase/server";
import { getSportConfig } from "@/lib/sports";
import {
  scorePlayerMatch,
  type PlayerMatchStats,
} from "@/lib/fantasy-scoring";
import { effectivePointsWithLineup } from "@/lib/fantasy-scoring/lineup-multipliers";
import { parseCricApiMatchUuid } from "@/lib/cricapi/match-id";
import { mapCricApiExtractedToPerformances } from "@/lib/cricapi/map-player-names";
import { fetchScorecardWithFallback } from "@/lib/scoring/fetch-with-fallback";
import { isCricApiError, classifyCricApiError } from "@/lib/cricapi/errors";
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

const SCORE_CONFLICT = "league_id,match_id,score_team_key";

async function mapCricApiNamesToPerformances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sportId: string,
  rows: { playerName: string; stats: PlayerMatchStats }[],
): Promise<{ performances: PerformanceInput[]; unmatched: string[] }> {
  const { data: players, error } = await supabase.from("players").select("id, name, name_aliases").eq("sport_id", sportId);
  if (error) throw new Error(error.message);
  const result = mapCricApiExtractedToPerformances(players ?? [], rows);
  return { performances: result.performances, unmatched: result.unmatched };
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

  let effectiveMatchId = String(match_id).trim();
  if (cricapi_match_id && String(cricapi_match_id).trim()) {
    try {
      effectiveMatchId = parseCricApiMatchUuid(String(cricapi_match_id));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid CricAPI match id" },
        { status: 400 },
      );
    }
  }

  const { data: league, error: lErr } = await supabase
    .from("fantasy_leagues")
    .select("id, room_id, sport_id, host_id, league_kind")
    .eq("id", league_id)
    .single();

  if (lErr || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.host_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isPrivate = league.league_kind === "private";
  const xiSize = getSportConfig(league.sport_id)?.lineup?.xiSize ?? 11;

  let teamList: TeamLineupRow[] = [];
  const playerToTeam = new Map<string, string>();
  /** `auction` → auction_teams.id; `private` → private_league_teams.id */
  let scoreKind: "auction" | "private" = "auction";
  const squadByTeamId = new Map<string, string[]>();
  const autoXiByTeamId = new Map<string, string[]>();
  const priceByPlayerId = new Map<string, number>();
  const spentByTeamId = new Map<string, Record<string, number>>();

  if (isPrivate) {
    scoreKind = "private";
    const { data: pteams, error: ptErr } = await supabase
      .from("private_league_teams")
      .select("id, squad_player_ids, squad_player_prices, starting_xi_player_ids, captain_player_id, vice_captain_player_id")
      .eq("league_id", league_id);
    if (ptErr) return NextResponse.json({ error: ptErr.message }, { status: 500 });
    teamList = (pteams ?? []).map((t) => ({
      id: t.id,
      starting_xi_player_ids: t.starting_xi_player_ids ?? [],
      captain_player_id: t.captain_player_id ?? null,
      vice_captain_player_id: t.vice_captain_player_id ?? null,
    }));
    for (const t of pteams ?? []) {
      const squad = (t.squad_player_ids ?? []) as string[];
      squadByTeamId.set(t.id as string, squad);
      spentByTeamId.set(
        t.id as string,
        (t.squad_player_prices && typeof t.squad_player_prices === "object"
          ? (t.squad_player_prices as Record<string, number>)
          : {}) ?? {},
      );
      for (const pid of t.squad_player_ids ?? []) {
        playerToTeam.set(pid, t.id);
      }
    }

    // If a team hasn't set a Playing XI, default to their 11 most expensive squad players
    // by amount spent in the offline draft (`squad_player_prices`), falling back to `players.base_price`.
    const allSquadPlayerIds = [...new Set((pteams ?? []).flatMap((t) => (t.squad_player_ids ?? []) as string[]))];
    if (allSquadPlayerIds.length) {
      const { data: priceRows, error: prErr } = await supabase
        .from("players")
        .select("id, base_price")
        .in("id", allSquadPlayerIds);
      if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });
      for (const r of (priceRows ?? []) as Array<{ id: string; base_price: number }>) {
        priceByPlayerId.set(r.id, Number(r.base_price ?? 0));
      }
    }

    for (const t of teamList) {
      const xi = t.starting_xi_player_ids ?? [];
      if (xi.length > 0) continue;
      const squad = squadByTeamId.get(t.id) ?? [];
      const spent = spentByTeamId.get(t.id) ?? {};
      const sorted = squad
        .slice()
        .sort((a, b) => {
          const sa = Number(spent[a] ?? 0);
          const sb = Number(spent[b] ?? 0);
          if (sb !== sa) return sb - sa;
          const pa = priceByPlayerId.get(a) ?? 0;
          const pb = priceByPlayerId.get(b) ?? 0;
          if (pb !== pa) return pb - pa;
          return String(a).localeCompare(String(b));
        });
      const autoXi = sorted.slice(0, xiSize);
      autoXiByTeamId.set(t.id, autoXi);
    }
  } else {
    if (!league.room_id) {
      return NextResponse.json({ error: "Auction league missing room_id" }, { status: 500 });
    }
    const { data: teams, error: tmErr } = await supabase
      .from("auction_teams")
      .select("id, starting_xi_player_ids, captain_player_id, vice_captain_player_id")
      .eq("room_id", league.room_id);
    if (tmErr) return NextResponse.json({ error: tmErr.message }, { status: 500 });
    teamList = (teams ?? []) as TeamLineupRow[];

    const { data: soldRows, error: srErr } = await supabase
      .from("auction_results")
      .select("player_id, team_id")
      .eq("room_id", league.room_id)
      .eq("is_unsold", false);
    if (srErr) return NextResponse.json({ error: srErr.message }, { status: 500 });
    for (const r of soldRows ?? []) {
      if (r.player_id && r.team_id) playerToTeam.set(r.player_id, r.team_id);
    }
  }

  let unmatchedNames: string[] | undefined;
  let cricapiUsed = false;
  let cricExtractedCount = 0;
  let cricSampleNames: string[] = [];

  let dataSource: "cricapi" | "cricsheet_cache" | undefined;

  if (cricapi_match_id && String(cricapi_match_id).trim()) {
    cricapiUsed = true;
    try {
      const result = await fetchScorecardWithFallback({
        matchId: effectiveMatchId,
        matchDate: match_date,
        supabase,
      });
      const extracted = result.performances;
      dataSource = result.provider;
      cricExtractedCount = extracted.length;
      cricSampleNames = extracted.slice(0, 25).map((e) => e.playerName);

      if (cricExtractedCount === 0) {
        const summarize = (payload: unknown) => {
          if (!payload || typeof payload !== "object") return null;
          const o = payload as Record<string, unknown>;
          const data = o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : null;
          const inningsTop = Array.isArray(o.innings) ? o.innings.length : null;
          const scoreTop = Array.isArray(o.score) ? o.score.length : null;

          const reasonVal = o.reason;
          return {
            top_level_keys: Object.keys(o).slice(0, 40),
            cricapi_status: o.status !== undefined ? o.status : null,
            cricapi_reason:
              typeof reasonVal === "string"
                ? reasonVal.slice(0, 500)
                : reasonVal != null
                  ? String(reasonVal).slice(0, 500)
                  : null,
            data_present: Boolean(data),
            data_keys: data ? Object.keys(data).slice(0, 40) : [],
            innings_len: data && Array.isArray(data.innings) ? data.innings.length : null,
            score_len: data && Array.isArray(data.score) ? data.score.length : null,
            innings_top_len: inningsTop,
            score_top_len: scoreTop,
          };
        };

        return NextResponse.json(
          {
            error:
              `Scorecard (via ${dataSource ?? "cricapi"}) had no batting rows that matched our parser.`,
            extracted_batters: cricExtractedCount,
            sample_cricapi_names: cricSampleNames,
            unmatched_names: [],
            hint:
              "The payload structure for this scorecard differs from what we expect. Check the returned scorecard_shape and we’ll tune the extractor to match.",
            scorecard_shape: result.raw ? summarize(result.raw) : null,
            data_source: dataSource,
          },
          { status: 400 },
        );
      }

      const mapped = await mapCricApiNamesToPerformances(supabase, league.sport_id, extracted);
      performances = mapped.performances;
      unmatchedNames = mapped.unmatched.length ? mapped.unmatched : undefined;
    } catch (e) {
      if (isCricApiError(e)) {
        const { friendlyTitle, friendlyMessage, code, retryable } = e.classified;
        return NextResponse.json(
          { error: friendlyMessage, friendlyTitle, friendlyMessage, code, retryable },
          { status: 502 },
        );
      }
      const msg = e instanceof Error ? e.message : "CricAPI fetch failed";
      const classified = classifyCricApiError(msg);
      return NextResponse.json(
        {
          error: classified.friendlyMessage,
          friendlyTitle: classified.friendlyTitle,
          friendlyMessage: classified.friendlyMessage,
          code: classified.code,
          retryable: classified.retryable,
        },
        { status: 502 },
      );
    }
  }

  if (Array.isArray(performances) && performances.length > 0) {
    const lineupByTeam = new Map<string, TeamLineupRow>();
    for (const t of teamList) lineupByTeam.set(t.id, t);

    // Build player name lookup for enriched player_lines
    const perfPlayerIds = [...new Set(performances.map((p) => p.player_id).filter(Boolean))];
    const playerNameById = new Map<string, string>();
    if (perfPlayerIds.length > 0) {
      const { data: nameRows } = await supabase.from("players").select("id, name").in("id", perfPlayerIds);
      for (const r of nameRows ?? []) playerNameById.set(r.id, r.name);
    }

    const pickTopBySpent = (teamId: string, playerIds: string[], k: number): string[] => {
      const spent = spentByTeamId.get(teamId) ?? {};
      return playerIds
        .slice()
        .sort((a, b) => {
          const sa = Number(spent[a] ?? 0);
          const sb = Number(spent[b] ?? 0);
          if (sb !== sa) return sb - sa;
          const pa = priceByPlayerId.get(a) ?? 0;
          const pb = priceByPlayerId.get(b) ?? 0;
          if (pb !== pa) return pb - pa;
          return String(a).localeCompare(String(b));
        })
        .slice(0, k);
    };

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

      const { total: baseTotal, breakdown: pointsBreakdown, sections } = scorePlayerMatch(stats);
      const teamRow = lineupByTeam.get(teamId);
      const rawXi = teamRow?.starting_xi_player_ids ?? [];
      const isAutoXi = isPrivate && rawXi.length === 0 && (autoXiByTeamId.get(teamId)?.length ?? 0) > 0;
      const xi = isAutoXi ? (autoXiByTeamId.get(teamId) ?? []) : rawXi;
      const picked = isPrivate ? pickTopBySpent(teamId, xi, 2) : [];
      const captainPlayerId =
        (teamRow?.captain_player_id ?? null) ?? (isPrivate ? (picked[0] ?? null) : null);
      const viceCaptainPlayerId =
        (teamRow?.vice_captain_player_id ?? null) ?? (isPrivate ? (picked[1] ?? null) : null);
      const { effective, counted, multiplier } = effectivePointsWithLineup(baseTotal, row.player_id, {
        startingXiPlayerIds: xi.filter(Boolean),
        captainPlayerId,
        viceCaptainPlayerId,
      });

      if (!counted) continue;

      const bucket = agg.get(teamId);
      if (!bucket) continue;
      bucket.total += effective;
      bucket.detail.push({
        player_id: row.player_id,
        player_name: playerNameById.get(row.player_id) ?? null,
        base_points: baseTotal,
        multiplier,
        effective_points: effective,
        stats: {
          ...(row.batting ? { batting: row.batting } : {}),
          ...(row.bowling ? { bowling: row.bowling } : {}),
          ...(row.fielding ? { fielding: row.fielding } : {}),
        },
        sections,
        breakdown: pointsBreakdown,
        ...(isAutoXi ? { auto_xi: true } : {}),
      });
      applied++;
    }

    const rows =
      scoreKind === "private"
        ? teamList.map((t) => {
            const b = agg.get(t.id)!;
            return {
              league_id,
              team_id: null as string | null,
              private_team_id: t.id,
              match_id: String(effectiveMatchId),
              match_date,
              total_points: Math.round(b.total * 100) / 100,
              breakdown: {
                ...b.breakdown,
                source: cricapiUsed ? "cricapi_v1" : "engine_v2_auto_xi_price",
                performances_applied: applied,
                player_lines: b.detail.slice(0, 40),
                league_kind: "private",
                ...(unmatchedNames?.length ? { cricapi_unmatched_names: unmatchedNames } : {}),
              },
            };
          })
        : teamList.map((t) => {
            const b = agg.get(t.id)!;
            return {
              league_id,
              team_id: t.id,
              private_team_id: null as string | null,
              match_id: String(effectiveMatchId),
              match_date,
              total_points: Math.round(b.total * 100) / 100,
              breakdown: {
                ...b.breakdown,
                source: cricapiUsed ? "cricapi_v1" : "engine_v2_auto_xi_price",
                performances_applied: applied,
                player_lines: b.detail.slice(0, 40),
                ...(unmatchedNames?.length ? { cricapi_unmatched_names: unmatchedNames } : {}),
              },
            };
          });

    const { error } = await supabase.from("fantasy_scores").upsert(rows, {
      onConflict: SCORE_CONFLICT,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      updated: rows.length,
      mode: cricapiUsed ? "cricapi" : "performances",
      data_source: dataSource ?? (cricapiUsed ? "cricapi" : "manual"),
      performances_applied: applied,
      ...(unmatchedNames?.length ? { unmatched_names: unmatchedNames } : {}),
    });
  }

  if (cricapiUsed) {
    return NextResponse.json(
      {
        error:
          "CricAPI scorecard had no players that matched your DB (or no batting rows were parsed). Check extracted_batters and unmatched_names.",
        extracted_batters: cricExtractedCount,
        sample_cricapi_names: cricSampleNames,
        unmatched_names: unmatchedNames ?? [],
        hint:
          cricExtractedCount === 0
            ? "Parser found zero batting rows — CricAPI JSON shape may differ; open Network tab or log scorecard structure."
            : "Rename players in Supabase to match CricAPI (e.g. V Kohli → Virat Kohli), or fix last-name collisions.",
      },
      { status: 400 },
    );
  }

  const scoring = getSportConfig(league.sport_id)?.scoring ?? [];
  const playingXi = scoring.find((s) => s.action === "playing_xi");

  const mockRows =
    scoreKind === "private"
      ? teamList.map((t, i) => {
          const base = 20 + (i + 1) * 3 + (match_id.length % 7);
          const breakdown = {
            mock: base,
            playing_xi: playingXi?.points ?? 0,
            source: "mock",
            league_kind: "private",
          };
          const total = base + (playingXi?.points ?? 0);
          return {
            league_id,
            team_id: null as string | null,
            private_team_id: t.id,
            match_id: String(match_id),
            match_date,
            total_points: total,
            breakdown,
          };
        })
      : teamList.map((t, i) => {
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
            private_team_id: null as string | null,
            match_id: String(match_id),
            match_date,
            total_points: total,
            breakdown,
          };
        });

  const { error } = await supabase.from("fantasy_scores").upsert(mockRows, {
    onConflict: SCORE_CONFLICT,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, updated: mockRows.length, mode: "mock" });
}
