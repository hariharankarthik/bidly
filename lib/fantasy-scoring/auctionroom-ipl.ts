/**
 * IPL fantasy scoring aligned with AuctionArena / auctionroom-style rules
 * (batting base, milestones "highest only", strike rate tiers, bowling, economy).
 * CricAPI (or any provider) should map scorecard JSON → these structs, then call aggregate helpers.
 */

export type BattingStats = {
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  /** True if dismissed; duck = dismissed && runs === 0 */
  dismissed: boolean;
  /** +4 when named in playing XI (apply once per match per player). */
  playedInStartingXi?: boolean;
};

export type BowlingStats = {
  ballsBowled: number;
  runsConceded: number;
  /** Wickets that count for bowling fantasy (exclude run-outs). */
  wicketsExcludingRunOut: number;
  /** Subset of those wickets dismissed bowled or LBW — +8 each on top of wicket points. */
  lbwOrBowledWickets: number;
  maidens: number;
  dotBalls: number;
};

export type FieldingStats = {
  catches?: number;
  stumpings?: number;
  runOutsDirect?: number;
  runOutsThrower?: number;
};

export type PlayerMatchStats = {
  batting?: BattingStats;
  bowling?: BowlingStats;
  fielding?: FieldingStats;
};

const FIELDING_POINTS = {
  catch: 8,
  stumping: 12,
  runOutDirect: 12,
  runOutThrower: 6,
} as const;

function battingMilestoneHighestOnly(runs: number): number {
  if (runs >= 100) return 16;
  if (runs >= 75) return 12;
  if (runs >= 50) return 8;
  if (runs >= 25) return 4;
  return 0;
}

function strikeRateBonus(runs: number, ballsFaced: number): { pts: number; eligible: boolean } {
  if (ballsFaced <= 0) return { pts: 0, eligible: false };
  const eligible = ballsFaced >= 10 || runs >= 20;
  if (!eligible) return { pts: 0, eligible: false };
  const sr = (runs / ballsFaced) * 100;
  if (sr > 190) return { pts: 8, eligible: true };
  if (sr > 170) return { pts: 6, eligible: true };
  if (sr > 150) return { pts: 4, eligible: true };
  if (sr >= 130) return { pts: 2, eligible: true };
  if (sr >= 70 && sr <= 100) return { pts: -2, eligible: true };
  if (sr >= 60 && sr < 70) return { pts: -4, eligible: true };
  if (sr >= 50 && sr < 60) return { pts: -6, eligible: true };
  return { pts: 0, eligible: true };
}

function bowlingWicketMilestoneHighestOnly(w: number): number {
  if (w >= 5) return 16;
  if (w >= 4) return 12;
  if (w >= 3) return 8;
  return 0;
}

function economyBonus(runsConceded: number, ballsBowled: number): { pts: number; eligible: boolean } {
  const overs = ballsBowled / 6;
  if (overs < 2) return { pts: 0, eligible: false };
  const econ = runsConceded / overs;
  if (econ < 5) return { pts: 8, eligible: true };
  if (econ < 6) return { pts: 6, eligible: true };
  if (econ <= 7) return { pts: 4, eligible: true };
  if (econ > 7 && econ <= 8) return { pts: 2, eligible: true };
  if (econ >= 10 && econ <= 11) return { pts: -2, eligible: true };
  if (econ > 11 && econ <= 12) return { pts: -4, eligible: true };
  if (econ > 12) return { pts: -6, eligible: true };
  return { pts: 0, eligible: true };
}

export function scoreBatting(b: BattingStats): { points: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  if (b.playedInStartingXi) breakdown.playing_xi = 4;

  breakdown.runs = b.runs * 1;
  breakdown.fours_bonus = b.fours * 4;
  breakdown.sixes_bonus = b.sixes * 6;

  if (b.dismissed && b.runs === 0) {
    breakdown.duck = -2;
  }

  const mile = battingMilestoneHighestOnly(b.runs);
  if (mile) breakdown.batting_milestone = mile;

  const sr = strikeRateBonus(b.runs, b.ballsFaced);
  if (sr.eligible && sr.pts !== 0) breakdown.strike_rate = sr.pts;

  const points = Object.values(breakdown).reduce((a, x) => a + x, 0);
  return { points, breakdown };
}

export function scoreBowling(b: BowlingStats): { points: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  breakdown.dot_balls = b.dotBalls * 2;
  breakdown.wickets = b.wicketsExcludingRunOut * 30;
  breakdown.lbw_bowled_bonus = b.lbwOrBowledWickets * 8;
  breakdown.maidens = b.maidens * 12;

  const wm = bowlingWicketMilestoneHighestOnly(b.wicketsExcludingRunOut);
  if (wm) breakdown.wicket_milestone = wm;

  const econ = economyBonus(b.runsConceded, b.ballsBowled);
  if (econ.eligible && econ.pts !== 0) breakdown.economy = econ.pts;

  const points = Object.values(breakdown).reduce((a, x) => a + x, 0);
  return { points, breakdown };
}

export function scoreFielding(f: FieldingStats): { points: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  const c = f.catches ?? 0;
  const s = f.stumpings ?? 0;
  const rd = f.runOutsDirect ?? 0;
  const rt = f.runOutsThrower ?? 0;
  if (c) breakdown.catches = c * FIELDING_POINTS.catch;
  if (s) breakdown.stumpings = s * FIELDING_POINTS.stumping;
  if (rd) breakdown.run_out_direct = rd * FIELDING_POINTS.runOutDirect;
  if (rt) breakdown.run_out_thrower = rt * FIELDING_POINTS.runOutThrower;
  const points = Object.values(breakdown).reduce((a, x) => a + x, 0);
  return { points, breakdown };
}

/** Full player match total + flat breakdown keys for JSON storage. */
export function scorePlayerMatch(stats: PlayerMatchStats): {
  total: number;
  breakdown: Record<string, number>;
  sections: { batting?: Record<string, number>; bowling?: Record<string, number>; fielding?: Record<string, number> };
} {
  let total = 0;
  const breakdown: Record<string, number> = {};
  const sections: {
    batting?: Record<string, number>;
    bowling?: Record<string, number>;
    fielding?: Record<string, number>;
  } = {};

  if (stats.batting) {
    const r = scoreBatting(stats.batting);
    sections.batting = r.breakdown;
    for (const [k, v] of Object.entries(r.breakdown)) {
      breakdown[`bat_${k}`] = v;
    }
    total += r.points;
  }
  if (stats.bowling) {
    const r = scoreBowling(stats.bowling);
    sections.bowling = r.breakdown;
    for (const [k, v] of Object.entries(r.breakdown)) {
      breakdown[`bowl_${k}`] = v;
    }
    total += r.points;
  }
  if (stats.fielding) {
    const r = scoreFielding(stats.fielding);
    sections.fielding = r.breakdown;
    for (const [k, v] of Object.entries(r.breakdown)) {
      breakdown[`field_${k}`] = v;
    }
    total += r.points;
  }

  return { total, breakdown, sections };
}
