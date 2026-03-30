import { createServerClient } from "@supabase/ssr";
import { scorePlayerMatch, type PlayerMatchStats } from "@/lib/fantasy-scoring";
import { effectivePointsWithLineup } from "@/lib/fantasy-scoring/lineup-multipliers";
import {
  extractPerformancesFromCricApiJson,
  fetchCricApiScorecardJson,
  mergeBowlingFromCricApiJson,
  normalizeName,
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

type PerformanceRow = {
  player_id: string;
  batting?: PlayerMatchStats["batting"];
  bowling?: PlayerMatchStats["bowling"];
  fielding?: PlayerMatchStats["fielding"];
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

function extractUniqueIdsFromCurrentMatches(raw: unknown, matchDatePrefix: string, teamSubstrings: string[]) {
  const obj = raw as Record<string, unknown>;
  const matchesRaw = obj?.["matches"];
  const matches: unknown[] = Array.isArray(matchesRaw) ? matchesRaw : [];
  const uniqueIds: string[] = [];

  const norm = (s: unknown) => String(s ?? "").toLowerCase();

  for (const m of matches) {
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    const uid = mm["unique_id"] ?? mm["uniqueId"];
    if (!uid) continue;

    const team1 = norm(mm?.["team-1"] ?? mm?.team1 ?? mm?.team_1);
    const team2 = norm(mm?.["team-2"] ?? mm?.team2 ?? mm?.team_2);
    const type = norm(mm?.type);
    const started = Boolean(mm?.matchStarted);
    const date = norm(mm?.date);

    const matchesIplTeam = teamSubstrings.some((sub) => {
      const ss = sub.toLowerCase();
      return team1.includes(ss) || team2.includes(ss);
    });
    if (!matchesIplTeam) continue;

    // Prefer matches whose date matches today (if CricAPI returns date); fall back to started.
    const dateOk = matchDatePrefix ? date.startsWith(matchDatePrefix.toLowerCase()) : true;
    if (!dateOk) continue;
    if (!started && type) {
      // if started isn't provided but type exists, still allow through if date matches
    }

    uniqueIds.push(String(uid));
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  return uniqueIds.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
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
 * Match discovery (listing today's matches) is intentionally not built yet.
 */
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const cricApiKey = process.env.CRICAPI_KEY?.trim();

  const provided = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("token");
  if (!cronSecret || !provided || provided !== cronSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase service env vars" }, { status: 500 });
  }

  const matchIdsRaw = process.env.CRICAPI_DAILY_MATCH_IDS ?? "";
  let matchIds = parseCsv(matchIdsRaw);
  if (matchIds.length === 0) {
    if (!cricApiKey) {
      return NextResponse.json(
        { error: "No match ids provided and CRICAPI_KEY is missing" },
        { status: 400 },
      );
    }

    const matchDatePrefix = (process.env.CRICAPI_DAILY_MATCH_DATE ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const teamSubstrings = parseCsv(process.env.CRICAPI_IPL_TEAM_SUBSTRINGS ?? "chennai,mumbai,kolkata,delhi,rajasthan,punjab,bangalore,lucknow,gujarat,hyderabad");

    // MVP: pull first page of currentMatches (offset=0). If your match list is large, increase offsets.
    const raw = await fetchCurrentMatchesFromCricApi(cricApiKey, 0);
    matchIds = extractUniqueIdsFromCurrentMatches(raw, matchDatePrefix, teamSubstrings);
    // Fallback: if CricAPI date format differs, retry without date filtering.
    if (!matchIds.length) {
      matchIds = extractUniqueIdsFromCurrentMatches(raw, "", teamSubstrings);
    }
  }

  const matchDate = process.env.CRICAPI_DAILY_MATCH_DATE ?? new Date().toISOString().slice(0, 10);
  if (!matchIds.length) {
    return NextResponse.json({ error: "No IPL match ids found for today via currentMatches" }, { status: 400 });
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
    .eq("status", "active");
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
    // Fetch scorecard once per match id
    const raw = await fetchCricApiScorecardJson(matchId);
    let extracted = extractPerformancesFromCricApiJson(raw);
    extracted = mergeBowlingFromCricApiJson(extracted, raw);

    for (const league of leagues ?? []) {
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

      const performances: PerformanceRow[] = [];
      const players = playersBySport.get(league.sport_id) ?? [];

      for (const row of extracted) {
        const key = normalizeName(row.playerName);
        const exact = players.find((p) => normalizeName(p.name) === key);
        const fuzzy =
          exact ??
          players.find(
            (p) =>
              key.length >= 4 &&
              (normalizeName(p.name).includes(key) || key.includes(normalizeName(p.name))),
          );
        if (!fuzzy) continue;
        performances.push({ player_id: fuzzy.id, ...row.stats });
      }

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
          match_id: String(matchId),
          match_date: matchDate,
          total_points: Math.round(b.total * 100) / 100,
          breakdown: {
            source: "cricapi_v1",
            engine_version: "auctionroom-ipl-v1",
          },
        };
      });

      const { error } = await supabaseAdmin.from("fantasy_scores").upsert(upsertRows, {
        onConflict: "league_id,team_id,match_id",
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true, synced_matches: matchIds.length, updated: updatedTotal });
}

