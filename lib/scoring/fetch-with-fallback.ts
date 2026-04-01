/**
 * Scorecard fetcher with automatic fallback.
 *
 * **Primary: CricAPI** — has data in real-time (live/same-day), but limited
 * to 100 req/day on the free tier.
 *
 * **Backfill: Cricsheet** — free, unlimited, ball-by-ball data available
 * 24–48h after match completion. Used to backfill matches that CricAPI
 * couldn't serve due to rate-limiting.
 *
 * Flow:
 * 1. Try CricAPI (real-time data)
 * 2. If rate-limited → check Cricsheet cache (populated by cron auto-sync)
 * 3. If Cricsheet also missing → throw rate-limit error (match stays pending
 *    for backfill on next cron run)
 *
 * Usage:
 * ```ts
 * const { performances, provider } = await fetchScorecardWithFallback({
 *   matchId,
 *   matchDate: "2026-03-30",
 *   supabase,
 * });
 * ```
 */

import {
  fetchCricApiScorecardJson,
  extractPerformancesFromCricApiJson,
  mergeBowlingFromCricApiJson,
  type CricApiMappedPerformance,
} from "@/lib/cricapi/fetch-scorecard";
import { isCricApiError } from "@/lib/cricapi/errors";

type FallbackOpts = {
  /** CricAPI match UUID (used for CricAPI call). */
  matchId: string;
  /** Match date YYYY-MM-DD (used for Cricsheet cache lookup). */
  matchDate?: string;
  /** Optional expected team names (improves multi-match day matching). */
  expectedTeams?: string[];
  /** Supabase client for querying cricsheet_cache. */
  supabase?: SupabaseLike | null;
};

type FallbackResult = {
  performances: CricApiMappedPerformance[];
  provider: "cricapi" | "cricsheet_cache";
  raw?: unknown;
};

type SupabaseLike = { from: (table: string) => unknown };

/**
 * Fetch scorecard with automatic provider selection.
 *
 * 1. Try CricAPI (primary — real-time data)
 * 2. On rate-limit → try Cricsheet cache (backfill from previous cron sync)
 * 3. If both miss → re-throw rate-limit error (match stays pending)
 */
export async function fetchScorecardWithFallback(
  opts: FallbackOpts,
): Promise<FallbackResult> {
  const { matchId, matchDate, expectedTeams, supabase } = opts;

  try {
    // 1. Try CricAPI first (primary — real-time)
    const raw = await fetchCricApiScorecardJson(matchId);
    let extracted = extractPerformancesFromCricApiJson(raw);
    extracted = mergeBowlingFromCricApiJson(extracted, raw);
    return { performances: extracted, provider: "cricapi", raw };
  } catch (err) {
    // Only fall back to Cricsheet for rate-limit errors
    if (!isCricApiError(err) || err.classified.code !== "RATE_LIMIT") {
      throw err;
    }

    // 2. CricAPI rate-limited → try Cricsheet cache (backfill data)
    if (supabase && matchDate) {
      const cached = await tryLoadCricsheetCache(supabase, matchDate, expectedTeams);
      if (cached && cached.length > 0) {
        return { performances: cached, provider: "cricsheet_cache" };
      }
    }

    // 3. Cricsheet also doesn't have data yet — re-throw
    // The match stays un-scored; next cron run will auto-sync Cricsheet
    // and retry.
    throw err;
  }
}

/**
 * Try to load pre-imported Cricsheet performances from the
 * `cricsheet_cache` table, matched by date.
 *
 * Cricsheet and CricAPI use completely different ID systems (ESPN numeric
 * IDs vs CricAPI UUIDs), so we match by match date instead.
 *
 * When there are 2 matches on the same day (common in IPL), we merge
 * performances from all matches. This is safe because IPL players don't
 * play twice on the same day, and the downstream name-matching only picks
 * players that exist in the DB.
 */
async function tryLoadCricsheetCache(
  supabase: SupabaseLike,
  matchDate: string,
  expectedTeams?: string[],
): Promise<CricApiMappedPerformance[] | null> {
  try {
    const result = await (supabase.from("cricsheet_cache") as {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: Array<{ performances: CricApiMappedPerformance[]; teams?: string[] }> | null;
          error: unknown;
        }>;
      };
    })
      .select("performances,teams")
      .eq("match_date", matchDate);

    if (result.error || !result.data || result.data.length === 0) return null;

    // If teams are provided, pick the exact match row for multi-match dates.
    if (expectedTeams && expectedTeams.length > 0) {
      for (const row of result.data) {
        if (teamsMatch(expectedTeams, row.teams ?? [])) {
          return row.performances;
        }
      }
      return null;
    }

    // Ambiguous date (2 matches): don't guess without teams.
    if (result.data.length > 1) return null;

    return result.data[0].performances;
  } catch {
    // Table may not exist yet — that's fine, just means no cache
    return null;
  }
}

function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamLike(a: string, b: string): boolean {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  return x === y || x.includes(y) || y.includes(x);
}

function teamsMatch(expected: string[], candidate: string[]): boolean {
  if (expected.length < 2 || candidate.length < 2) return false;
  const [e1, e2] = expected;
  const [c1, c2] = candidate;
  return (teamLike(e1, c1) && teamLike(e2, c2)) || (teamLike(e1, c2) && teamLike(e2, c1));
}
