import type { BattingStats, BowlingStats, PlayerMatchStats } from "@/lib/fantasy-scoring";

const BASE = "https://api.cricapi.com/v1";

export type CricApiMappedPerformance = {
  playerName: string;
  stats: PlayerMatchStats;
};

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** True if row looks like a dismissed innings (not "did not bat"). */
function isDismissedBatting(row: Record<string, unknown>): boolean {
  const d = str(row["dismissal-info"] ?? row.dismissal ?? row.dismissalInfo ?? "");
  if (!d) return false;
  const low = d.toLowerCase();
  if (low.includes("not out") || low.includes("did not bat") || low.includes("dnb")) return false;
  return true;
}

function addBattingToMap(
  byName: Map<string, CricApiMappedPerformance>,
  displayName: string,
  b: BattingStats,
) {
  if (!displayName) return;
  const nk = normalizeName(displayName);
  const cur = byName.get(nk);
  if (!cur) {
    byName.set(nk, { playerName: displayName, stats: { batting: { ...b } } });
    return;
  }
  const prev = cur.stats.batting;
  if (!prev) {
    cur.stats.batting = { ...b };
    return;
  }
  cur.stats.batting = {
    runs: prev.runs + b.runs,
    ballsFaced: prev.ballsFaced + b.ballsFaced,
    fours: prev.fours + b.fours,
    sixes: prev.sixes + b.sixes,
    dismissed: prev.dismissed || b.dismissed,
    playedInStartingXi: true,
  };
}

function parseBatsmanRow(raw: Record<string, unknown>): { name: string; batting: BattingStats } | null {
  const name =
    str(raw.batsman ?? raw.name ?? raw.player ?? raw.shortName ?? raw["Batsman"]) ||
    str(raw["batsman"]);
  if (!name) return null;
  const runs = num(raw.R ?? raw.runs ?? raw.run);
  const balls = num(raw.B ?? raw.balls ?? raw.bf ?? raw.ballsFaced);
  const fours = num(raw["4s"] ?? raw.fours ?? raw.four);
  const sixes = num(raw["6s"] ?? raw.sixes ?? raw.six);
  return {
    name,
    batting: {
      runs,
      ballsFaced: balls,
      fours,
      sixes,
      dismissed: isDismissedBatting(raw),
      playedInStartingXi: true,
    },
  };
}

/**
 * CricAPI-style innings array + fallback deep scan for `batsman`/`R` rows.
 */
export function extractPerformancesFromCricApiJson(data: unknown): CricApiMappedPerformance[] {
  const byName = new Map<string, CricApiMappedPerformance>();

  const root = data && typeof data === "object" && "data" in data ? (data as { data: unknown }).data : data;
  const inningsList = Array.isArray(root) ? root : [];

  for (const inn of inningsList) {
    if (!inn || typeof inn !== "object") continue;
    const scores = (inn as Record<string, unknown>).scores;
    if (!Array.isArray(scores)) continue;
    for (const group of scores) {
      const rows = Array.isArray(group) ? group : [group];
      for (const raw of rows) {
        if (!raw || typeof raw !== "object") continue;
        const row = parseBatsmanRow(raw as Record<string, unknown>);
        if (row) addBattingToMap(byName, row.name, row.batting);
      }
    }
  }

  if (byName.size === 0) {
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const x of node) visit(x);
        return;
      }
      const o = node as Record<string, unknown>;
      if ("batsman" in o || "Batsman" in o) {
        const row = parseBatsmanRow(o);
        if (row) addBattingToMap(byName, row.name, row.batting);
      }
      for (const v of Object.values(o)) visit(v);
    };
    visit(data);
  }

  return [...byName.values()];
}

export async function fetchCricApiScorecardJson(matchId: string): Promise<unknown> {
  const apiKey = process.env.CRICAPI_KEY?.trim();
  if (!apiKey) {
    throw new Error("CRICAPI_KEY is not set. Add it in Vercel / .env.local.");
  }
  const url = `${BASE}/match_scorecard?apikey=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(matchId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`CricAPI HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json() as Promise<unknown>;
}

/** Optional: merge bowling if present in payload (best-effort). */
export function mergeBowlingFromCricApiJson(
  performances: CricApiMappedPerformance[],
  data: unknown,
): CricApiMappedPerformance[] {
  const byName = new Map(performances.map((p) => [normalizeName(p.playerName), p]));

  function visit(node: unknown) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const bowl = o.bowling ?? o.bowlers;
    if (Array.isArray(bowl)) {
      for (const raw of bowl) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const name = str(r.bowler ?? r.name ?? r.player);
        if (!name) continue;
        const key = normalizeName(name);
        const row = byName.get(key);
        if (!row) continue;
        const overs = num(r.O ?? r.overs);
        const ballsBowled = Math.round(overs * 6) || num(r.balls ?? r.b);
        const runsConceded = num(r.R ?? r.runs ?? r.rc);
        const wickets = num(r.W ?? r.wickets ?? r.wk);
        const maidens = num(r.M ?? r.maidens ?? r.maiden);
        const dots = num(r["0s"] ?? r.dots ?? 0);
        const bowling: BowlingStats = {
          ballsBowled,
          runsConceded,
          wicketsExcludingRunOut: wickets,
          lbwOrBowledWickets: 0,
          maidens,
          dotBalls: dots,
        };
        row.stats = { ...row.stats, bowling };
      }
    }
    for (const v of Object.values(o)) visit(v);
  }

  const root = typeof data === "object" && data !== null && "data" in (data as object)
    ? (data as { data: unknown }).data
    : data;
  visit(root);
  return performances;
}
