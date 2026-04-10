import { createServerClient } from "@supabase/ssr";
import { scorePlayerMatch, type PlayerMatchStats } from "@/lib/fantasy-scoring";
import { effectivePointsWithLineup } from "@/lib/fantasy-scoring/lineup-multipliers";
import { extractMatchIdsFromCurrentMatchesJson } from "@/lib/cricapi/discover-match-ids";
import { mapCricApiExtractedToPerformances } from "@/lib/cricapi/map-player-names";
import { fetchScorecardWithFallback } from "@/lib/scoring/fetch-with-fallback";
import { parseCricsheetMatch } from "@/lib/cricsheet/fetch-scorecard";
import { CricApiError, isCricApiError } from "@/lib/cricapi/errors";
import { computeEffectiveXi } from "@/lib/xi-composition";
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
  room_id: string | null;
  sport_id: string;
  league_kind: string;
  started_at: string | null;
};

type PendingSyncRow = {
  id?: string;
  match_id: string;
  match_date: string;
  teams?: string[] | null;
  status: "pending" | "synced" | "failed";
  source_preferred: "cricapi";
  last_error_code?: string | null;
  last_error_message?: string | null;
  attempts?: number;
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
    throw new CricApiError(`CricAPI currentMatches HTTP ${res.status}: ${t.slice(0, 200)}`, res.status);
  }
  return (await res.json()) as unknown;
}

function mergeBreakdown(into: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) {
    into[k] = (into[k] ?? 0) + v;
  }
}

function mergeUniqueIds(base: string[], add: string[]): string[] {
  const seen = new Set(base);
  for (const id of add) {
    if (!seen.has(id)) {
      seen.add(id);
      base.push(id);
    }
  }
  return base;
}

const CRICSHEET_RECENT_URL = "https://cricsheet.org/downloads/recently_added_2_json.zip";

type DiscoveredMatchMeta = {
  teams: string[];
  matchDate: string | null;
};

function collectMatchMetaById(raw: unknown): Map<string, DiscoveredMatchMeta> {
  const out = new Map<string, DiscoveredMatchMeta>();
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  const rows = obj.matches ?? obj.data;
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const idRaw = r.unique_id ?? r.uniqueId ?? r.id ?? r.match_id ?? r.matchId;
    if (!idRaw) continue;
    const id = String(idRaw);

    const teamInfoRaw = r.teamInfo ?? r.teaminfo ?? r.teamsInfo;
    const teamsRaw = r.teams;
    const names: string[] = [];

    if (Array.isArray(teamInfoRaw)) {
      for (const t of teamInfoRaw) {
        if (typeof t === "string") names.push(t);
        else if (t && typeof t === "object") {
          const o = t as Record<string, unknown>;
          const n = o.name ?? o.shortname ?? o.shortName ?? o.title ?? o.teamName;
          if (n) names.push(String(n));
        }
      }
    }
    if (Array.isArray(teamsRaw) && names.length < 2) {
      for (const t of teamsRaw) {
        if (typeof t === "string") names.push(t);
      }
    }
    const t1 = r["team-1"] ?? r.team1 ?? r.team_1;
    const t2 = r["team-2"] ?? r.team2 ?? r.team_2;
    if (t1 && names.length < 1) names.push(String(t1));
    if (t2 && names.length < 2) names.push(String(t2));

    const dateRaw = r.date ?? r.dateTimeGMT ?? r.dateTime ?? r.matchDate ?? r.match_datetime;
    const dateStr = typeof dateRaw === "string" ? dateRaw.slice(0, 10) : null;

    if (names.length >= 2) {
      out.set(id, { teams: [names[0], names[1]], matchDate: dateStr });
    }
  }
  return out;
}

async function loadPendingMatches(
  supabase: ReturnType<typeof createServerClient>,
  maxDate: string,
): Promise<PendingSyncRow[]> {
  const res = await supabase
    .from("cricket_sync_tracker")
    .select("match_id,match_date,teams,status,source_preferred,last_error_code,last_error_message,attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", 10)
    .lte("match_date", maxDate)
    .order("match_date", { ascending: true })
    .limit(100);
  if (res.error) return [];
  return (res.data ?? []) as PendingSyncRow[];
}

async function markPending(
  supabase: ReturnType<typeof createServerClient>,
  row: PendingSyncRow,
): Promise<void> {
  // Upsert first to ensure the row exists, then atomically increment attempts via rpc
  await supabase.from("cricket_sync_tracker").upsert(
    {
      match_id: row.match_id,
      match_date: row.match_date,
      teams: row.teams ?? null,
      source_preferred: "cricapi",
      status: "pending",
      last_error_code: row.last_error_code ?? null,
      last_error_message: row.last_error_message ?? null,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  // Atomic increment — avoids race condition if cron runs concurrently
  await supabase.rpc("increment_sync_attempts", { p_match_id: row.match_id });
}

async function markSynced(
  supabase: ReturnType<typeof createServerClient>,
  row: PendingSyncRow,
): Promise<void> {
  await supabase.from("cricket_sync_tracker").upsert(
    {
      match_id: row.match_id,
      match_date: row.match_date,
      teams: row.teams ?? null,
      source_preferred: "cricapi",
      status: "synced",
      last_error_code: null,
      last_error_message: null,
      resolved_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
}

async function markFailed(
  supabase: ReturnType<typeof createServerClient>,
  row: PendingSyncRow & { error_code?: string; error_message?: string },
): Promise<void> {
  await supabase.from("cricket_sync_tracker").upsert(
    {
      match_id: row.match_id,
      match_date: row.match_date,
      teams: row.teams ?? null,
      source_preferred: "cricapi",
      status: "failed",
      last_error_code: row.error_code ?? "UNKNOWN",
      last_error_message: row.error_message ?? "Unknown error",
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  // Atomic increment
  await supabase.rpc("increment_sync_attempts", { p_match_id: row.match_id });
}

/**
 * Download Cricsheet's "recently added" ZIP (matches from last 2 days) and
 * import any IPL matches into the `cricsheet_cache` table. This runs before
 * the CricAPI scorecard loop so the cache is warm.
 *
 * Fails silently — Cricsheet unavailability should never block the cron.
 */
async function syncRecentCricsheetMatches(
  supabase: ReturnType<typeof createServerClient>,
): Promise<number> {
  try {
    const res = await fetch(CRICSHEET_RECENT_URL, { cache: "no-store" });
    if (!res.ok) return 0;

    const arrayBuf = await res.arrayBuffer();

    const buf = Buffer.from(arrayBuf);

    // Minimal ZIP parser: find local file headers (PK\x03\x04)
    const files = parseZipEntries(buf);
    let imported = 0;

    for (const { name, data } of files) {
      if (!name.endsWith(".json") || name === "README.txt") continue;
      try {
        const raw = JSON.parse(data.toString("utf-8"));
        const info = raw.info;
        const eventName = (info?.event?.name ?? "").toLowerCase();
        if (!eventName.includes("indian premier league") && !eventName.includes("ipl")) continue;

        const performances = parseCricsheetMatch(raw);
        const matchId = name.replace(".json", "");

        await supabase.from("cricsheet_cache").upsert(
          {
            match_id: matchId,
            season: String(info.season ?? ""),
            teams: info.teams,
            event_name: info.event?.name ?? "",
            match_date: info.dates?.[0] ?? "",
            performances,
          },
          { onConflict: "match_id" },
        );
        imported++;
      } catch {
        // Skip unparseable files
      }
    }
    return imported;
  } catch {
    // Cricsheet unavailable — not fatal
    return 0;
  }
}

/**
 * Minimal ZIP entry parser — extracts uncompressed file entries from a ZIP
 * buffer. Handles STORE (method 0) and DEFLATE (method 8).
 */
function parseZipEntries(buf: Buffer): Array<{ name: string; data: Buffer }> {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require("node:zlib");

  while (offset + 30 <= buf.length) {
    // Local file header signature = PK\x03\x04
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf-8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const compData = buf.subarray(dataStart, dataStart + compSize);

    let fileData: Buffer;
    if (method === 0) {
      fileData = compData;
    } else if (method === 8) {
      fileData = zlib.inflateRawSync(compData);
    } else {
      offset = dataStart + compSize;
      continue;
    }

    entries.push({ name, data: fileData });
    offset = dataStart + compSize;
  }
  return entries;
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

  const matchIdsRaw = process.env.CRICAPI_DAILY_MATCH_IDS ?? "";
  const matchIds = parseCsv(matchIdsRaw);

  const envDateTrim = (process.env.CRICAPI_DAILY_MATCH_DATE ?? "").trim().slice(0, 10);
  const yyyyMmDd = (d: Date) => d.toISOString().slice(0, 10);
  /** Calendar day for discovery primary pass and for fantasy_scores.match_date (UTC “logical” day). */
  const cronMatchDate = envDateTrim || yyyyMmDd(new Date());
  const yesterdayOfAnchor = yyyyMmDd(
    new Date(new Date(`${cronMatchDate}T12:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000),
  );
  const discoveredMetaById = new Map<string, DiscoveredMatchMeta>();

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

    // Discovery: read all pages (0..3). Some days have 2+ matches and CricAPI
    // may split same-day matches across offsets.
    const raws: unknown[] = [];
    for (const offset of [0, 1, 2, 3]) {
      const r = await fetchCurrentMatchesFromCricApi(cricApiKey, offset);
      raws.push(r);
      const ids = discover(r, matchDatePrefix);
      mergeUniqueIds(matchIds, ids);
      const mm = collectMatchMetaById(r);
      for (const [id, meta] of mm.entries()) {
        discoveredMetaById.set(id, meta);
      }
    }
    // Fallback 1: if match ended after midnight / date mismatch, try yesterday.
    if (!matchIds.length) {
        for (const r of raws) mergeUniqueIds(matchIds, discover(r, yesterdayPrefix));
      }
      // Fallback 2: if CricAPI date format differs, retry without date filtering.
      if (!matchIds.length) {
        for (const r of raws) mergeUniqueIds(matchIds, discover(r, ""));
      }

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

  const { data: leagues, error: lErr } = await supabaseAdmin
    .from("fantasy_leagues")
    .select("id, room_id, sport_id, league_kind, started_at")
    .eq("status", "active");
  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  const auctionLeagues = (leagues ?? []).filter((l: ActiveLeagueRow) => l.league_kind === "auction");
  const privateLeagues = (leagues ?? []).filter((l: ActiveLeagueRow) => l.league_kind === "private");

  // Preload players for each sport once.
  const sportIds = [...new Set((leagues ?? []).map((l: ActiveLeagueRow) => l.sport_id))];
  const playersBySport = new Map<string, { id: string; name: string }[]>();
  await Promise.all(
    sportIds.map(async (sportId) => {
      const { data, error } = await supabaseAdmin.from("players").select("id, name").eq("sport_id", sportId);
      if (!error) playersBySport.set(sportId, data ?? []);
    }),
  );

  // Auto-sync Cricsheet's recently added matches into cache.
  // This ensures the Cricsheet cache is warm BEFORE we try scorecard fetches,
  // so fetchScorecardWithFallback can find them by match date.
  const cricsheetImported = await syncRecentCricsheetMatches(supabaseAdmin);

  // Include previously pending/failed matches so they can auto-backfill later.
  const pendingRows = await loadPendingMatches(supabaseAdmin, cronMatchDate);
  const pendingIds = pendingRows.map((r) => r.match_id);
  mergeUniqueIds(matchIds, pendingIds);
  const pendingById = new Map(pendingRows.map((r) => [r.match_id, r]));

  let updatedTotal = 0;
  let pendingCount = 0;
  let syncedFromPending = 0;
  let failedCount = 0;
  let skippedMaxAttempts = 0;

  for (const matchId of matchIds) {
    const meta = discoveredMetaById.get(matchId);
    const pendingMeta = pendingById.get(matchId);
    const expectedTeams = meta?.teams ?? pendingMeta?.teams ?? undefined;
    const effectiveMatchDate = meta?.matchDate ?? pendingMeta?.match_date ?? cronMatchDate;

    // Look up actual attempt count from tracker (covers both pending and newly discovered matches)
    const MAX_ATTEMPTS = 10;
    let priorAttempts = pendingMeta?.attempts ?? 0;
    if (!pendingMeta) {
      const { data: trackerRow } = await supabaseAdmin
        .from("cricket_sync_tracker")
        .select("attempts, status")
        .eq("match_id", matchId)
        .maybeSingle();
      if (trackerRow) {
        priorAttempts = trackerRow.attempts ?? 0;
      }
    }
    if (priorAttempts >= MAX_ATTEMPTS) {
      skippedMaxAttempts += 1;
      // Mark permanently failed if not already
      if (pendingMeta?.status !== "failed") {
        await markFailed(supabaseAdmin, {
          match_id: matchId,
          match_date: effectiveMatchDate,
          teams: expectedTeams,
          status: "failed",
          source_preferred: "cricapi",
          error_code: "MAX_ATTEMPTS",
          error_message: `Gave up after ${priorAttempts} attempts. Check player name mappings or CricAPI data availability.`,
        });
      }
      continue;
    }

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
        await markSynced(supabaseAdmin, {
          match_id: matchId,
          match_date: effectiveMatchDate,
          teams: expectedTeams,
          status: "synced",
          source_preferred: "cricapi",
        });
        continue;
      }
    }

    // Wrap entire match scoring in try-catch so one match failure doesn't crash the whole cron
    try {

    let extracted;
    try {
      // Fetch scorecard: primary CricAPI; on rate-limit use Cricsheet cache.
      const result = await fetchScorecardWithFallback({
        matchId,
        matchDate: effectiveMatchDate,
        expectedTeams,
        supabase: supabaseAdmin,
      });
      extracted = result.performances;
    } catch (e) {
      if (isCricApiError(e) && e.classified.code === "RATE_LIMIT") {
        pendingCount += 1;
        await markPending(supabaseAdmin, {
          match_id: matchId,
          match_date: effectiveMatchDate,
          teams: expectedTeams,
          status: "pending",
          source_preferred: "cricapi",
          last_error_code: e.classified.code,
          last_error_message: e.classified.friendlyMessage,
        });
        continue;
      }
      // Non-rate-limit error — mark as failed, continue to next match
      failedCount += 1;
      const errMsg = e instanceof Error ? e.message : String(e);
      const errCode = isCricApiError(e) ? e.classified.code : "FETCH_ERROR";
      console.error(`[cron] Match ${matchId} fetch failed: ${errMsg}`);
      await markFailed(supabaseAdmin, {
        match_id: matchId,
        match_date: effectiveMatchDate,
        teams: expectedTeams,
        status: "failed",
        source_preferred: "cricapi",
        error_code: errCode,
        error_message: errMsg.slice(0, 500),
      });
      continue;
    }

    // Guard: if extracted has entries but ALL names failed to match, don't mark synced
    // This applies per-league below, but check globally first for a fast fail
    if (extracted.length === 0) {
      failedCount += 1;
      console.error(`[cron] Match ${matchId}: CricAPI returned no batting performances`);
      await markFailed(supabaseAdmin, {
        match_id: matchId,
        match_date: effectiveMatchDate,
        teams: expectedTeams,
        status: "failed",
        source_preferred: "cricapi",
        error_code: "EMPTY_SCORECARD",
        error_message: "CricAPI returned no batting performances. Match may not be complete yet.",
      });
      continue;
    }

    for (const league of auctionLeagues) {
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
      const { performances, unmatched } = mapCricApiExtractedToPerformances(players, extracted);

      // Log unmatched names for debugging
      if (unmatched.length > 0) {
        console.warn(
          `[cron] Match ${matchId}, league ${league.id}: ${unmatched.length} unmatched player(s): ${unmatched.join(", ")}`,
        );
      }

      // Guard: if ALL extracted players failed name matching, skip scoring this league
      if (performances.length === 0 && extracted.length > 0) {
        console.error(
          `[cron] Match ${matchId}, league ${league.id}: ALL ${extracted.length} player names unmatched — skipping`,
        );
        continue;
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
          private_team_id: null as string | null,
          match_id: String(matchId),
          match_date: effectiveMatchDate,
          total_points: Math.round(b.total * 100) / 100,
          breakdown: {
            source: "cricapi_v1",
            engine_version: "auctionroom-ipl-v1",
            ...(unmatched.length > 0 ? { unmatched_names: unmatched } : {}),
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

    // --- Score private leagues for the same match ---
    for (const league of privateLeagues) {
      // Skip if this match+league is already scored (idempotent / manual trigger already ran)
      if (!force) {
        const { data: existingScore } = await supabaseAdmin
          .from("fantasy_scores")
          .select("id", { head: false })
          .eq("league_id", league.id)
          .eq("match_id", String(matchId))
          .limit(1);
        if (existingScore && existingScore.length > 0) continue;
      }

      const pteamsRes = await supabaseAdmin
        .from("private_league_teams")
        .select("id, squad_player_ids, squad_player_prices, starting_xi_player_ids, captain_player_id, vice_captain_player_id, claimed_by, xi_confirmed_at")
        .eq("league_id", league.id);
      const pteams = (pteamsRes.data ?? []) as Array<{
        id: string;
        squad_player_ids: string[];
        squad_player_prices: Record<string, number> | null;
        starting_xi_player_ids: string[] | null;
        captain_player_id: string | null;
        vice_captain_player_id: string | null;
        claimed_by: string | null;
        xi_confirmed_at: string | null;
      }>;
      if (pteams.length === 0) continue;

      // For leagues that went through draft → active (have started_at),
      // gate scoring until every claimed team has confirmed their XI at least once.
      if (league.started_at) {
        const claimedWithoutXi = pteams.filter((t) => t.claimed_by && !t.xi_confirmed_at);
        if (claimedWithoutXi.length > 0) {
          console.log(
            `[private-scoring] Skipping league ${league.id}: ${claimedWithoutXi.length} claimed team(s) have never set XI`,
          );
          continue;
        }
      }

      const pTeamList: TeamLineupRow[] = pteams.map((t) => ({
        id: t.id,
        starting_xi_player_ids: t.starting_xi_player_ids ?? [],
        captain_player_id: t.captain_player_id ?? null,
        vice_captain_player_id: t.vice_captain_player_id ?? null,
      }));
      const pPlayerToTeam = new Map<string, string>();
      for (const t of pteams) {
        for (const pid of t.squad_player_ids ?? []) {
          pPlayerToTeam.set(pid, t.id);
        }
      }

      const players = playersBySport.get(league.sport_id) ?? [];
      const { performances: pPerformances, unmatched: pUnmatched } = mapCricApiExtractedToPerformances(players, extracted);

      if (pUnmatched.length > 0) {
        console.warn(
          `[cron] Match ${matchId}, private league ${league.id}: ${pUnmatched.length} unmatched player(s): ${pUnmatched.join(", ")}`,
        );
      }

      if (pPerformances.length === 0 && extracted.length > 0) {
        console.error(
          `[cron] Match ${matchId}, private league ${league.id}: ALL ${extracted.length} player names unmatched — skipping`,
        );
        continue;
      }

      // Build matchPlayerIds set and role/price maps for auto-substitution
      const matchPlayerIds = new Set(pPerformances.map((row) => row.player_id));
      const allSquadIds = [...new Set(pteams.flatMap((t) => t.squad_player_ids ?? []))];
      const roleMap = new Map<string, string>();
      const basePriceMap = new Map<string, number>();
      if (allSquadIds.length > 0) {
        const { data: playerMeta } = await supabaseAdmin
          .from("players")
          .select("id, role, base_price")
          .in("id", allSquadIds);
        for (const p of playerMeta ?? []) {
          roleMap.set(p.id, p.role ?? "BAT");
          basePriceMap.set(p.id, p.base_price ?? 0);
        }
      }

      // Compute effective XI (with auto-subs) per team
      const effectiveLineups = new Map<string, { xi: string[]; captain: string | null; vc: string | null }>();
      for (const t of pteams) {
        const squad = t.squad_player_ids ?? [];
        const xi = t.starting_xi_player_ids ?? [];
        const spent = t.squad_player_prices ?? {};
        const teamPriceMap = new Map<string, number>();
        for (const pid of squad) {
          teamPriceMap.set(pid, Number(spent[pid] ?? 0) || (basePriceMap.get(pid) ?? 0));
        }

        const { effectiveXi, effectiveCaptain, effectiveVc, substitutions } = computeEffectiveXi({
          xiPlayerIds: xi,
          squadPlayerIds: squad,
          captainId: t.captain_player_id ?? null,
          vcId: t.vice_captain_player_id ?? null,
          matchPlayerIds,
          roleMap,
          priceMap: teamPriceMap,
        });
        if (substitutions.length > 0) {
          console.log(
            `[auto-sub] League ${league.id}, Team ${t.id}: ${substitutions.map((s) => `${s.out} → ${s.in}`).join(", ")}`,
          );
        }
        effectiveLineups.set(t.id, { xi: effectiveXi, captain: effectiveCaptain, vc: effectiveVc });
      }

      const pAgg = new Map<string, { total: number; breakdown: Record<string, number> }>();
      for (const t of pTeamList) pAgg.set(t.id, { total: 0, breakdown: {} });

      for (const row of pPerformances) {
        const teamId = pPlayerToTeam.get(row.player_id);
        if (!teamId) continue;
        const teamRow = pTeamList.find((t) => t.id === teamId);
        if (!teamRow) continue;

        const eff = effectiveLineups.get(teamId);
        const stats: PlayerMatchStats = { batting: row.batting, bowling: row.bowling, fielding: row.fielding };
        const { total: baseTotal, breakdown } = scorePlayerMatch(stats);
        const { effective, counted } = effectivePointsWithLineup(baseTotal, row.player_id, {
          startingXiPlayerIds: eff?.xi ?? teamRow.starting_xi_player_ids ?? [],
          captainPlayerId: eff?.captain ?? teamRow.captain_player_id ?? null,
          viceCaptainPlayerId: eff?.vc ?? teamRow.vice_captain_player_id ?? null,
        });
        if (!counted) continue;
        const bucket = pAgg.get(teamId);
        if (!bucket) continue;
        bucket.total += effective;
        mergeBreakdown(bucket.breakdown, breakdown);
        updatedTotal += 1;
      }

      const pUpsertRows = pTeamList.map((t) => {
        const b = pAgg.get(t.id)!;
        return {
          league_id: league.id,
          team_id: null as string | null,
          private_team_id: t.id,
          match_id: String(matchId),
          match_date: effectiveMatchDate,
          total_points: Math.round(b.total * 100) / 100,
          breakdown: {
            source: "cricapi_v1",
            engine_version: "auctionroom-ipl-v1",
            league_kind: "private",
            ...(pUnmatched.length > 0 ? { unmatched_names: pUnmatched } : {}),
          },
        };
      });

      const { error: pErr } = await supabaseAdmin.from("fantasy_scores").upsert(pUpsertRows, {
        onConflict: "league_id,match_id,score_team_key",
      });
      if (pErr) {
        return NextResponse.json({ error: pErr.message }, { status: 500 });
      }
    }

    if (pendingById.has(matchId)) syncedFromPending += 1;
    await markSynced(supabaseAdmin, {
      match_id: matchId,
      match_date: effectiveMatchDate,
      teams: expectedTeams,
      status: "synced",
      source_preferred: "cricapi",
    });

    } catch (matchErr) {
      // Catch-all: any unexpected error during this match's scoring
      failedCount += 1;
      const errMsg = matchErr instanceof Error ? matchErr.message : String(matchErr);
      console.error(`[cron] Match ${matchId} unexpected error: ${errMsg}`);
      await markFailed(supabaseAdmin, {
        match_id: matchId,
        match_date: effectiveMatchDate,
        teams: expectedTeams,
        status: "failed",
        source_preferred: "cricapi",
        error_code: "UNEXPECTED",
        error_message: errMsg.slice(0, 500),
      });
    }
  }

  return json({
    success: true,
    synced_matches: matchIds.length,
    updated: updatedTotal,
    pending: pendingCount,
    failed: failedCount,
    skipped_max_attempts: skippedMaxAttempts,
    synced_from_pending: syncedFromPending,
    cricsheet_imported: cricsheetImported,
    cron_match_date: cronMatchDate,
  });
}
