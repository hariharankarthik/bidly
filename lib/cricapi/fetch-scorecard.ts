import type { BattingStats, BowlingStats, PlayerMatchStats } from "@/lib/fantasy-scoring";
import { parseCricApiMatchUuid } from "@/lib/cricapi/match-id";
import { CricApiError } from "@/lib/cricapi/errors";

const BASE = "https://api.cricapi.com/v1";

/**
 * CricAPI often returns HTTP 200 with `{ status, reason }` and no `data` when quota/key/plan blocks the call.
 * Fail fast with `reason` instead of treating it like an empty scorecard.
 */
export function assertCricApiScorecardPayload(payload: unknown): void {
  if (payload == null || typeof payload !== "object") {
    throw new Error("CricAPI returned an empty or invalid JSON body.");
  }
  const o = payload as Record<string, unknown>;
  const reason = o.reason != null ? String(o.reason).trim() : "";
  const statusRaw = o.status;
  const status = typeof statusRaw === "string" ? statusRaw.toLowerCase() : "";

  if (status === "failure" || status === "error") {
    throw new CricApiError(reason || "CricAPI returned a failure status.");
  }

  const data = o.data;
  if (data === undefined || data === null) {
    if (reason) {
      throw new CricApiError(`CricAPI: ${reason}`);
    }
    if (status && status !== "success") {
      throw new CricApiError(`CricAPI returned status "${String(statusRaw)}" with no scorecard data.`);
    }
    throw new CricApiError(
      "CricAPI returned no scorecard data (check API key, credits, and match_scorecard access).",
    );
  }
}

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

function batsmanDisplayName(raw: Record<string, unknown>): string {
  const b = raw.batsman ?? raw.Batsman;
  if (typeof b === "string") return str(b);
  if (b && typeof b === "object") {
    const bo = b as Record<string, unknown>;
    return str(bo.name ?? bo.shortName ?? bo.longname ?? bo.displayName);
  }
  return str(raw.name ?? raw.player ?? raw.shortName);
}

function parseBatsmanRow(raw: Record<string, unknown>): { name: string; batting: BattingStats } | null {
  const name = batsmanDisplayName(raw);
  if (!name) return null;

  // Some CricAPI payloads omit a literal `batsman` key and instead only provide stat fields.
  // Avoid accidentally treating bowling aggregates as batting by requiring at least one batting stat key.
  const hasBattingKeys =
    "R" in raw ||
    "runs" in raw ||
    "run" in raw ||
    "B" in raw ||
    "balls" in raw ||
    "bf" in raw ||
    "ballsFaced" in raw ||
    "4s" in raw ||
    "fours" in raw ||
    "4" in raw ||
    "6s" in raw ||
    "sixes" in raw ||
    "6" in raw;
  if (!hasBattingKeys) return null;

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
 * CricAPI `match_scorecard`: `data` may be innings[], or an object with `score` / `innings`.
 * Deep-scan merges any nested `batsman` rows.
 */
export function extractPerformancesFromCricApiJson(data: unknown): CricApiMappedPerformance[] {
  const byName = new Map<string, CricApiMappedPerformance>();

  const addFromObject = (raw: Record<string, unknown>) => {
    const row = parseBatsmanRow(raw);
    if (row) addBattingToMap(byName, row.name, row.batting);
  };

  const ingestInningsList = (inningsList: unknown[]) => {
    for (const inn of inningsList) {
      if (!inn || typeof inn !== "object") continue;
      const scores = (inn as Record<string, unknown>).scores;
      if (!Array.isArray(scores)) continue;
      for (const group of scores) {
        const rows = Array.isArray(group) ? group : [group];
        for (const raw of rows) {
          if (!raw || typeof raw !== "object") continue;
          addFromObject(raw as Record<string, unknown>);
        }
      }
    }
  };

  const root = data && typeof data === "object" && "data" in data ? (data as { data: unknown }).data : data;

  if (Array.isArray(root)) {
    ingestInningsList(root);
  } else if (root && typeof root === "object") {
    const o = root as Record<string, unknown>;
    if (Array.isArray(o.score)) ingestInningsList(o.score as unknown[]);
    if (Array.isArray(o.innings)) ingestInningsList(o.innings as unknown[]);
  }

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    const o = node as Record<string, unknown>;
    // Prefer batting-row detection by stat keys (some scorecards omit `batsman` literal).
    // This keeps deep-scan resilient across CricAPI payload variations.
    const looksLikeBatting =
      "batsman" in o ||
      "Batsman" in o ||
      "batsmen" in o ||
      "batting" in o ||
      "R" in o ||
      "runs" in o ||
      "run" in o ||
      "B" in o ||
      "balls" in o ||
      "bf" in o ||
      "ballsFaced" in o ||
      "4s" in o ||
      "fours" in o ||
      "6s" in o ||
      "sixes" in o;
    if (looksLikeBatting) addFromObject(o);
    for (const v of Object.values(o)) visit(v);
  };
  // Avoid double counting: if the primary parse already found batters, don't scan again.
  if (byName.size === 0) {
    visit(data);
    if (root != null && root !== data) visit(root);
  }

  return [...byName.values()];
}

export async function fetchCricApiScorecardJson(matchId: string): Promise<unknown> {
  const apiKey = process.env.CRICAPI_KEY?.trim();
  if (!apiKey) {
    throw new CricApiError("CRICAPI_KEY is not set. Add it in Vercel / .env.local.");
  }
  const id = parseCricApiMatchUuid(matchId);
  const url = `${BASE}/match_scorecard?apikey=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new CricApiError(`CricAPI HTTP ${res.status}: ${t.slice(0, 200)}`, res.status);
  }
  const json = (await res.json()) as unknown;
  assertCricApiScorecardPayload(json);
  return json;
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
