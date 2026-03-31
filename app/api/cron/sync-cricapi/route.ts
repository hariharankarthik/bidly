import { createServerClient } from "@supabase/ssr";
import { scorePlayerMatch, type PlayerMatchStats } from "@/lib/fantasy-scoring";
import { effectivePointsWithLineup } from "@/lib/fantasy-scoring/lineup-multipliers";
import { extractMatchIdsFromCurrentMatchesJson } from "@/lib/cricapi/discover-match-ids";
import { mapCricApiExtractedToPerformances } from "@/lib/cricapi/map-player-names";
import {
  extractPerformancesFromCricApiJson,
  fetchCricApiScorecardJson,
  mergeBowlingFromCricApiJson,
} from "@/lib/cricapi/fetch-scorecard";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type TeamLineupRow = {
  id: string;
  starting_xi_player_ids: string[] | null;
  captain_player_id: string | null;
  vice_captain_player_id: string | null;
};

type ActiveLeagueRow = {
  id: string;
  room_id: string;
  sport_id: string;
};

function parseCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function fetchCurrentMatchesFromCricApi(apikey: string, offset: number) {
  const url = `https://api.cricapi.com/v1/currentMatches?apikey=${encodeURIComponent(apikey)}&offset=${offset}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`CricAPI currentMatches HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as unknown;
}

function mergeBreakdown(into: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) {
    into[k] = (into[k] ?? 0) + v;
  }
}

/**
 * NOTE: This endpoint is intended to be called by Vercel Cron.
 * It uses SUPABASE_SERVICE_ROLE_KEY and therefore bypasses RLS.
 *
 * MVP behavior:
 * - Cron reads `CRICAPI_DAILY_MATCH_IDS` (comma-separated) and syncs those matches
 *   for every `fantasy_leagues` row where status = 'active'.
 *
 * Match discovery uses CRICAPI_IPL_SERIES_ID and optional CRICAPI_DAILY_MATCH_DATE (YYYY-MM-DD).
 */
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const cricApiKey = process.env.CRICAPI_KEY?.trim();
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const force = req.nextUrl.searchParams.get("force") === "1";

  const json = (body: unknown, init?: { status?: number }) => {
    const res = NextResponse.json(body, { status: init?.status });
    res.headers.set("cache-control", "no-store");
    return res;
  };

  // Auth: allow Vercel Cron header, otherwise require your shared secret (token / header / Bearer).
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!isVercelCron) {
    let provided =
      req.nextUrl.searchParams.get("token") ??
      req.headers.get("x-cron-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      null;
    // Common mistake: passing `token=CRON_SECRET=...` instead of `token=...`
    if (provided?.startsWith("CRON_SECRET=")) {
      provided = provided.slice("CRON_SECRET=".length);
    }
    if (!cronSecret || !provided || provided !== cronSecret) {
      return json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!url || !serviceKey) {
    return json(
      {
        error: "Missing Supabase service env vars",
        has_supabase_url: Boolean(url),
        has_service_role_key: Boolean(serviceKey),
      },
      { status: 500 },
    );
  }

  const matchIdsRaw = process.env.CRICAPI_DAILY_MATCH_IDS ?? "";
  let matchIds = parseCsv(matchIdsRaw);

  const envDateTrim = (process.env.CRICAPI_DAILY_MATCH_DATE ?? "").trim().slice(0, 10);
  const yyyyMmDd = (d: Date) => d.toISOString().slice(0, 10);
  /** Calendar day for discovery primary pass and for fantasy_scores.match_date (UTC “logical” day). */
  const cronMatchDate = envDateTrim || yyyyMmDd(new Date());
  const yesterdayOfAnchor = yyyyMmDd(
    new Date(new Date(`${cronMatchDate}T12:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000),
  );

  if (matchIds.length === 0) {
    if (!cricApiKey) {
      return json(
        {
          error: "No match ids provided and CRICAPI_KEY is missing",
          fix: "Set CRICAPI_KEY in Vercel env vars (Production).",
        },
        { status: 400 },
      );
    }

    const matchDatePrefix = cronMatchDate;
    const yesterdayPrefix = yesterdayOfAnchor;
    const seriesIdFilter = (process.env.CRICAPI_IPL_SERIES_ID ?? "").trim() || null;
    const seriesSubstrings = seriesIdFilter ? [] : ["indian premier league"];
    const teamSubstrings = parseCsv(process.env.CRICAPI_IPL_TEAM_SUBSTRINGS ?? "");

    const discover = (raw: unknown, datePrefix: string) =>
      extractMatchIdsFromCurrentMatchesJson(raw, {
        matchDatePrefix: datePrefix,
        teamSubstrings,
        seriesSubstrings,
        seriesIdFilter,
      });

    // Discovery: try a few pages since CricAPI is offset-based.
    const raws: unknown[] = [];
    for (const offset of [0, 1, 2, 3]) {
      const r = await fetchCurrentMatchesFromCricApi(cricApiKey, offset);
      raws.push(r);
      matchIds.push(...discover(r, matchDatePrefix));
    }
    // Fallback 1: if match ended after midnight / date mismatch, try yesterday.
    if (!matchIds.length) {
      for (const r of raws) {
        matchIds.push(...discover(r, yesterdayPrefix));
      }
    }
    // Fallback 2: if CricAPI date format differs, retry without date filtering.
    if (!matchIds.length) {
      for (const r of raws) {
        matchIds.push(...discover(r, ""));
      }
    }
    // Dedup across pages.
    matchIds = [...new Set(matchIds)];

    if (debug) {
      const describe = (r: unknown) => {
        const obj = (r && typeof r === "object" ? (r as Record<string, unknown>) : {}) as Record<string, unknown>;
        const listRaw = obj?.["matches"] ?? obj?.["data"];
        const list: unknown[] = Array.isArray(listRaw) ? listRaw : [];
        const sample = list.slice(0, 5).map((m) => {
          const mm = (m && typeof m === "object" ? (m as Record<string, unknown>) : {}) as Record<string, unknown>;
          return {
            unique_id: mm["unique_id"] ?? mm["uniqueId"] ?? null,
            id: mm["id"] ?? null,
            match_id: mm["match_id"] ?? mm["matchId"] ?? null,
            team_1: mm["team-1"] ?? mm["team1"] ?? mm["team_1"] ?? null,
            team_2: mm["team-2"] ?? mm["team2"] ?? mm["team_2"] ?? null,
            teams: mm["teams"] ?? null,
            teamInfo: mm["teamInfo"] ?? mm["teaminfo"] ?? mm["teamsInfo"] ?? null,
            name: mm["name"] ?? mm["title"] ?? null,
            date: mm["date"] ?? null,
            dateTimeGMT: mm["dateTimeGMT"] ?? null,
            series_id: mm["series_id"] ?? mm["seriesId"] ?? null,
            type: mm["type"] ?? null,
            matchType: mm["matchType"] ?? null,
            matchStarted: mm["matchStarted"] ?? null,
          };
        });
        return {
          top_level_keys: Object.keys(obj).slice(0, 30),
          list_field: obj["matches"] ? "matches" : obj["data"] ? "data" : null,
          list_length: list.length,
          sample,
        };
      };
      return json({
        debug: true,
        stage: "discovery",
        cron_match_date: cronMatchDate,
        match_date_prefix: matchDatePrefix,
        yesterday_date_prefix: yesterdayPrefix,
        series_id_filter: seriesIdFilter,
        series_name_substrings_applied: seriesSubstrings,
        team_substrings: teamSubstrings,
        discovered_match_ids: matchIds,
        pages: [0, 1, 2, 3].map((offset, i) => ({ offset, ...describe(raws[i]) })),
      });
    }
  }

  if (!matchIds.length) {
    return json(
      {
        error: "No IPL match ids found for today via currentMatches",
        fix: "Set CRICAPI_DAILY_MATCH_DATE (YYYY-MM-DD) if needed, CRICAPI_IPL_SERIES_ID, CRICAPI_DAILY_MATCH_IDS, or optional CRICAPI_IPL_TEAM_SUBSTRINGS.",
      },
      { status: 400 },
    );
  }

  const supabaseAdmin = createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        /* no-op */
      },
    },
  });

  const { data: leagues, error: lErr } = await supabaseAdmin
    .from("fantasy_leagues")
    .select("id, room_id, sport_id")
    .eq("status", "active")
    .eq("league_kind", "auction");
  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  // Preload players for each sport once.
  const sportIds = [...new Set((leagues ?? []).map((l: ActiveLeagueRow) => l.sport_id))];
  const playersBySport = new Map<string, { id: string; name: string }[]>();
  await Promise.all(
    sportIds.map(async (sportId) => {
      const { data, error } = await supabaseAdmin.from("players").select("id, name").eq("sport_id", sportId);
      if (!error) playersBySport.set(sportId, data ?? []);
    }),
  );

  let updatedTotal = 0;

  for (const matchId of matchIds) {
    // Cache: scorecards don't change for completed matches.
    // If we've already written *any* fantasy_scores rows for this match id, skip API calls.
    // Use `?force=1` to bypass (e.g. backfill / fix name mappings).
    if (!force) {
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("fantasy_scores")
        .select("id", { head: false })
        .eq("match_id", String(matchId))
        .limit(1);
      if (exErr) {
        return NextResponse.json({ error: exErr.message }, { status: 500 });
      }
      if (existing && existing.length > 0) {
        continue;
      }
    }

    // Fetch scorecard once per match id
    const raw = await fetchCricApiScorecardJson(matchId);
    let extracted = extractPerformancesFromCricApiJson(raw);
    extracted = mergeBowlingFromCricApiJson(extracted, raw);

    for (const league of leagues ?? []) {
      if (!league.room_id) continue;
      const teamListRes = await supabaseAdmin
        .from("auction_teams")
        .select("id, starting_xi_player_ids, captain_player_id, vice_captain_player_id")
        .eq("room_id", league.room_id);
      const teamList = (teamListRes.data ?? []) as TeamLineupRow[];

      // sold players define which players belong to which team for this room
      const soldRowsRes = await supabaseAdmin
        .from("auction_results")
        .select("player_id, team_id")
        .eq("room_id", league.room_id)
        .eq("is_unsold", false);
      const soldRows = soldRowsRes.data ?? [];
      const playerToTeam = new Map<string, string>();
      for (const r of soldRows) {
        if (r.player_id && r.team_id) playerToTeam.set(r.player_id, r.team_id);
      }

      const players = playersBySport.get(league.sport_id) ?? [];
      const { performances } = mapCricApiExtractedToPerformances(players, extracted);

      // Aggregate effective points per team with XI + C/VC multipliers
      const agg = new Map<string, { total: number; breakdown: Record<string, number> }>();
      for (const t of teamList) agg.set(t.id, { total: 0, breakdown: {} });

      for (const row of performances) {
        const teamId = playerToTeam.get(row.player_id);
        if (!teamId) continue;
        const teamRow = teamList.find((t) => t.id === teamId);
        if (!teamRow) continue;

        const stats: PlayerMatchStats = { batting: row.batting, bowling: row.bowling, fielding: row.fielding };
        const { total: baseTotal, breakdown } = scorePlayerMatch(stats);
        const { effective, counted } = effectivePointsWithLineup(baseTotal, row.player_id, {
          startingXiPlayerIds: teamRow.starting_xi_player_ids ?? [],
          captainPlayerId: teamRow.captain_player_id ?? null,
          viceCaptainPlayerId: teamRow.vice_captain_player_id ?? null,
        });
        if (!counted) continue;
        const bucket = agg.get(teamId);
        if (!bucket) continue;
        bucket.total += effective;
        mergeBreakdown(bucket.breakdown, breakdown);
        updatedTotal += 1;
      }

      const upsertRows = teamList.map((t) => {
        const b = agg.get(t.id)!;
        return {
          league_id: league.id,
          team_id: t.id,
          private_team_id: null as string | null,
          match_id: String(matchId),
          match_date: cronMatchDate,
          total_points: Math.round(b.total * 100) / 100,
          breakdown: {
            source: "cricapi_v1",
            engine_version: "auctionroom-ipl-v1",
          },
        };
      });

      const { error } = await supabaseAdmin.from("fantasy_scores").upsert(upsertRows, {
        onConflict: "league_id,match_id,score_team_key",
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return json({
    success: true,
    synced_matches: matchIds.length,
    updated: updatedTotal,
    cron_match_date: cronMatchDate,
  });
}
