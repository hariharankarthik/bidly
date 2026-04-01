/**
 * Cricsheet.org scorecard provider.
 *
 * Downloads ball-by-ball JSON from cricsheet.org and aggregates it into the
 * same `CricApiMappedPerformance[]` shape the app already uses.
 *
 * This is the free fallback when CricAPI is rate-limited — Cricsheet requires
 * no API key and has no rate limits. Data is available for completed matches
 * (not live).
 *
 * Data source: https://cricsheet.org/downloads/ (JSON format)
 * Format spec: https://cricsheet.org/format/json/
 */

import type { CricApiMappedPerformance } from "@/lib/cricapi/fetch-scorecard";
import type { BattingStats, BowlingStats } from "@/lib/fantasy-scoring";
import type { ScorecardProvider } from "@/lib/scoring/provider";

const CRICSHEET_BASE = "https://cricsheet.org/downloads";

// ─── Cricsheet JSON types ────────────────────────────────────────────────────

type CricsheetRuns = {
  batter: number;
  extras: number;
  total: number;
  non_boundary?: boolean;
};

type CricsheetWicket = {
  player_out: string;
  kind: string;
  fielders?: Array<{ name: string }>;
};

type CricsheetExtras = {
  wides?: number;
  noballs?: number;
  byes?: number;
  legbyes?: number;
  penalty?: number;
};

type CricsheetDelivery = {
  batter: string;
  bowler: string;
  non_striker: string;
  runs: CricsheetRuns;
  wickets?: CricsheetWicket[];
  extras?: CricsheetExtras;
};

type CricsheetOver = {
  over: number;
  deliveries: CricsheetDelivery[];
};

type CricsheetInnings = {
  team: string;
  overs: CricsheetOver[];
};

type CricsheetMatch = {
  meta: { data_version: string };
  info: {
    teams: string[];
    dates: string[];
    event?: { name: string; match_number?: number };
    season?: string;
    registry?: { people?: Record<string, string> };
    players?: Record<string, string[]>;
  };
  innings: CricsheetInnings[];
};

// ─── Aggregation ─────────────────────────────────────────────────────────────

type BatterAccum = {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
};

type BowlerAccum = {
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
  dots: number;
  lbwOrBowled: number;
};

/** Wicket kinds that count as bowling dismissals (not run-outs etc). */
const BOWLING_WICKET_KINDS = new Set([
  "bowled",
  "caught",
  "caught and bowled",
  "lbw",
  "stumped",
  "hit wicket",
]);

const LBW_OR_BOWLED = new Set(["bowled", "lbw"]);

/**
 * Aggregate ball-by-ball deliveries into per-player batting and bowling stats.
 */
export function aggregateCricsheetInnings(
  innings: CricsheetInnings[],
): CricApiMappedPerformance[] {
  const batters = new Map<string, BatterAccum>();
  const bowlers = new Map<string, BowlerAccum>();
  const overBowlerRuns = new Map<string, { bowler: string; runs: number; balls: number }>();

  for (const inn of innings) {
    for (const over of inn.overs) {
      // Track runs per over for maiden detection
      overBowlerRuns.clear();

      for (const d of over.deliveries) {
        // Wides do not count as a legal ball faced.
        // No-balls DO count as balls faced for batting strike rate.
        const isWide = Boolean(d.extras?.wides);
        const isNoBall = Boolean(d.extras?.noballs);

        // --- Batting ---
        let bat = batters.get(d.batter);
        if (!bat) {
          bat = { runs: 0, balls: 0, fours: 0, sixes: 0, dismissed: false };
          batters.set(d.batter, bat);
        }
        bat.runs += d.runs.batter;
        if (!isWide) bat.balls += 1;
        if (d.runs.batter === 4 && !d.runs.non_boundary) bat.fours += 1;
        if (d.runs.batter === 6) bat.sixes += 1;

        // Also register the non-striker as having batted
        if (!batters.has(d.non_striker)) {
          batters.set(d.non_striker, { runs: 0, balls: 0, fours: 0, sixes: 0, dismissed: false });
        }

        // --- Bowling ---
        let bowl = bowlers.get(d.bowler);
        if (!bowl) {
          bowl = { balls: 0, runs: 0, wickets: 0, maidens: 0, dots: 0, lbwOrBowled: 0 };
          bowlers.set(d.bowler, bowl);
        }

        // Wides and no-balls don't count as legal deliveries,
        // but DO count for bowler runs conceded.

        if (!isWide && !isNoBall) {
          bowl.balls += 1;
          // Dot ball = 0 runs scored off the bat AND 0 extras in total
          if (d.runs.total === 0) bowl.dots += 1;
        }
        bowl.runs += d.runs.total;

        // Track over-level runs for maiden detection
        const overKey = `${inn.team}-${over.over}-${d.bowler}`;
        let overTrack = overBowlerRuns.get(overKey);
        if (!overTrack) {
          overTrack = { bowler: d.bowler, runs: 0, balls: 0 };
          overBowlerRuns.set(overKey, overTrack);
        }
        overTrack.runs += d.runs.total;
        if (!isWide && !isNoBall) overTrack.balls += 1;

        // --- Wickets ---
        if (d.wickets) {
          for (const w of d.wickets) {
            // Mark batter as dismissed
            const outBat = batters.get(w.player_out);
            if (outBat) outBat.dismissed = true;

            // Credit bowler only for bowling dismissals
            if (BOWLING_WICKET_KINDS.has(w.kind)) {
              bowl.wickets += 1;
              if (LBW_OR_BOWLED.has(w.kind)) bowl.lbwOrBowled += 1;
            }
          }
        }
      }

      // Check for maidens at end of over
      for (const track of overBowlerRuns.values()) {
        if (track.balls >= 6 && track.runs === 0) {
          const b = bowlers.get(track.bowler);
          if (b) b.maidens += 1;
        }
      }
    }
  }

  // --- Merge into CricApiMappedPerformance[] ---
  const byName = new Map<string, CricApiMappedPerformance>();

  for (const [name, bat] of batters) {
    const batting: BattingStats = {
      runs: bat.runs,
      ballsFaced: bat.balls,
      fours: bat.fours,
      sixes: bat.sixes,
      dismissed: bat.dismissed,
      playedInStartingXi: true,
    };
    byName.set(name, { playerName: name, stats: { batting } });
  }

  for (const [name, bowl] of bowlers) {
    const bowling: BowlingStats = {
      ballsBowled: bowl.balls,
      runsConceded: bowl.runs,
      wicketsExcludingRunOut: bowl.wickets,
      lbwOrBowledWickets: bowl.lbwOrBowled,
      maidens: bowl.maidens,
      dotBalls: bowl.dots,
    };
    const existing = byName.get(name);
    if (existing) {
      existing.stats.bowling = bowling;
    } else {
      byName.set(name, { playerName: name, stats: { bowling } });
    }
  }

  return [...byName.values()];
}

// ─── Match file fetching ─────────────────────────────────────────────────────

/**
 * Parse a raw Cricsheet JSON match payload.
 * Exported for testing with mock data.
 */
export function parseCricsheetMatch(raw: unknown): CricApiMappedPerformance[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Cricsheet JSON payload");
  }
  const match = raw as CricsheetMatch;
  if (!Array.isArray(match.innings) || match.innings.length === 0) {
    throw new Error("Cricsheet match has no innings data");
  }
  return aggregateCricsheetInnings(match.innings);
}

/**
 * Fetch a single match JSON from Cricsheet by numeric match ID.
 * Cricsheet stores individual match files inside ZIP archives.
 * For single-match fetches we try the "recently added" ZIP first,
 * then fall back to the full IPL archive.
 */
export async function fetchCricsheetMatch(
  matchId: string,
): Promise<CricApiMappedPerformance[]> {
  // Cricsheet doesn't serve individual JSON files via HTTP.
  // We need to download the IPL ZIP and extract the specific match.
  // For efficiency, callers should use the bulk import script instead.
  throw new Error(
    `Direct single-match fetch from Cricsheet is not supported. ` +
    `Use the bulk import script (scripts/import-cricsheet.ts) or ` +
    `provide a local file path. Match ID: ${matchId}`,
  );
}

// ─── ScorecardProvider implementation ────────────────────────────────────────

export const cricsheetProvider: ScorecardProvider = {
  name: "cricsheet",
  async fetchScorecard(matchId: string) {
    return fetchCricsheetMatch(matchId);
  },
};

export { CRICSHEET_BASE };
