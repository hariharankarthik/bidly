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
  const d = str(
    row["dismissal-info"] ?? row.dismissal ?? row.dismissalInfo ??
    row.mode ?? row.how_out ?? row.wicketCode ?? row.out_desc ?? "",
  );
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
    "r" in raw ||
    "runs" in raw ||
    "run" in raw ||
    "B" in raw ||
    "b" in raw ||
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

  const runs = num(raw.R ?? raw.r ?? raw.runs ?? raw.run);
  const balls = num(raw.B ?? raw.b ?? raw.balls ?? raw.bf ?? raw.ballsFaced);
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
    // CricAPI v1 match_scorecard: data.scorecard[].batting[]
    if (Array.isArray(o.scorecard)) {
      for (const inn of o.scorecard as unknown[]) {
        if (!inn || typeof inn !== "object") continue;
        const batting = (inn as Record<string, unknown>).batting;
        if (Array.isArray(batting)) {
          for (const raw of batting) {
            if (raw && typeof raw === "object") addFromObject(raw as Record<string, unknown>);
          }
        }
      }
    }
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
      "r" in o ||
      "runs" in o ||
      "run" in o ||
      "B" in o ||
      "b" in o ||
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

  // Build last-name index for partial-name matching (CricAPI sometimes abbreviates)
  const byLastName = new Map<string, CricApiMappedPerformance[]>();
  for (const p of performances) {
    const parts = normalizeName(p.playerName).split(" ");
    const last = parts[parts.length - 1];
    if (last) {
      const arr = byLastName.get(last) ?? [];
      arr.push(p);
      byLastName.set(last, arr);
    }
  }

  function resolveBowler(name: string): CricApiMappedPerformance | null {
    const key = normalizeName(name);
    if (!key) return null;
    const exact = byName.get(key);
    if (exact) return exact;
    const parts = key.split(" ");
    const lastName = parts[parts.length - 1];
    const lastMatches = byLastName.get(lastName);
    if (lastMatches?.length === 1) return lastMatches[0];
    if (lastMatches && lastMatches.length > 1 && parts.length > 1) {
      const initial = parts[0][0];
      const disambig = lastMatches.filter((p) => normalizeName(p.playerName).startsWith(initial));
      if (disambig.length === 1) return disambig[0];
    }
    return null;
  }

  function visit(node: unknown) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const bowl = o.bowling ?? o.bowlers ?? o.bowler ?? o.Bowling ?? o.Bowlers;
    if (Array.isArray(bowl)) {
      for (const raw of bowl) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        // CricAPI bowling entries may have the name in various fields
        const nameCandidate = r.bowler ?? r.name ?? r.player ?? r.Bowler;
        // Handle nested object: {bowler: {name: "X"}} or {bowler: {id: "...", name: "X"}}
        const name = typeof nameCandidate === "string"
          ? str(nameCandidate)
          : (nameCandidate && typeof nameCandidate === "object"
            ? str((nameCandidate as Record<string, unknown>).name ?? (nameCandidate as Record<string, unknown>).displayName ?? "")
            : "");
        if (!name) continue;
        const row = resolveBowler(name);
        if (!row) continue;
        const overs = num(r.O ?? r.o ?? r.overs);
        const ballsBowled = Math.round(overs * 6) || num(r.balls ?? r.b);
        const runsConceded = num(r.R ?? r.r ?? r.runs ?? r.rc);
        const wickets = num(r.W ?? r.w ?? r.wickets ?? r.wk);
        const maidens = num(r.M ?? r.m ?? r.maidens ?? r.maiden);
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

// ── Fielding extraction from dismissal strings ──────────────────────

/**
 * Extract the dismissal text from a CricAPI batting row.
 * CricAPI uses various keys across payload versions.
 */
function getDismissalText(raw: Record<string, unknown>): string {
  return str(
    raw["dismissal-info"] ?? raw.dismissal ?? raw.dismissalInfo ??
    raw.mode ?? raw.how_out ?? raw.wicketCode ?? raw.out_desc ?? "",
  );
}

type FieldingCredit = { fielderName: string; type: "catch" | "stumping" | "runOutDirect" | "runOutThrower" };

/**
 * Parse a dismissal string into fielding credits.
 *
 * Common CricAPI patterns:
 *   "c Kohli b Bumrah"              → catch(Kohli)
 *   "c & b Bumrah"                  → catch(Bumrah)
 *   "c †Dhoni b Ashwin"             → catch(Dhoni)   († = keeper marker)
 *   "st Dhoni b Ashwin"             → stumping(Dhoni)
 *   "st †Dhoni b Ashwin"            → stumping(Dhoni)
 *   "run out (Jadeja)"              → runOutDirect(Jadeja)
 *   "run out (Jadeja/Dhoni)"        → runOutThrower(Jadeja) + runOutDirect(Dhoni)
 *   "run out Jadeja"                → runOutDirect(Jadeja)
 *   "lbw b Bumrah"                  → no fielding credit
 *   "b Ashwin"                      → no fielding credit
 *   "hit wicket b Ashwin"           → no fielding credit
 */
export function parseFieldingCredits(dismissalText: string): FieldingCredit[] {
  if (!dismissalText) return [];
  const text = dismissalText.trim();
  const lower = text.toLowerCase();

  // Caught: "c FielderName b BowlerName" or "c & b BowlerName"
  if (lower.startsWith("c ") || lower.startsWith("ct ") || lower.startsWith("caught ")) {
    // "c & b BowlerName" — bowler caught it themselves
    if (/^(?:c|ct|caught)\s+&\s+b\s+/i.test(text)) {
      const bowlerMatch = text.match(/^(?:c|ct|caught)\s+&\s+b\s+(.+)/i);
      if (bowlerMatch) {
        return [{ fielderName: cleanFielderName(bowlerMatch[1]), type: "catch" }];
      }
    }
    // "c FielderName b BowlerName"
    const catchMatch = text.match(/^(?:c|ct|caught)\s+(.+?)\s+b\s+/i);
    if (catchMatch) {
      return [{ fielderName: cleanFielderName(catchMatch[1]), type: "catch" }];
    }
  }

  // Stumped: "st FielderName b BowlerName"
  if (lower.startsWith("st ") || lower.startsWith("stumped ")) {
    const stMatch = text.match(/^(?:st|stumped)\s+(.+?)\s+b\s+/i);
    if (stMatch) {
      return [{ fielderName: cleanFielderName(stMatch[1]), type: "stumping" }];
    }
  }

  // Run out: "run out (Name)" or "run out (Thrower/Catcher)" or "run out Name"
  if (lower.includes("run out")) {
    // Parenthesized: "run out (Name1/Name2)" or "run out (Name)"
    const parenMatch = text.match(/run\s*out\s*\(([^)]+)\)/i);
    if (parenMatch) {
      const inside = parenMatch[1].trim();
      const parts = inside.split("/").map((s) => cleanFielderName(s));
      if (parts.length >= 2 && parts[0] && parts[1]) {
        // Thrower / Catcher (or direct-hit person is last)
        return [
          { fielderName: parts[0], type: "runOutThrower" },
          { fielderName: parts[1], type: "runOutDirect" },
        ];
      }
      if (parts[0]) {
        return [{ fielderName: parts[0], type: "runOutDirect" }];
      }
    }
    // No parens: "run out FielderName"
    const bareMatch = text.match(/run\s*out\s+([A-Z][\w\s.''-]+)/i);
    if (bareMatch) {
      return [{ fielderName: cleanFielderName(bareMatch[1]), type: "runOutDirect" }];
    }
  }

  return [];
}

/** Strip keeper marker (†), sub markers, and extra whitespace from fielder name. */
function cleanFielderName(name: string): string {
  return name
    .replace(/[†‡]/g, "")
    .replace(/\(sub\)/gi, "")
    .replace(/^sub\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merge fielding stats into existing performances by parsing dismissal strings.
 * Walks the CricAPI payload to find batting rows, extracts dismissal text,
 * and credits the correct fielder with catches/stumpings/run-outs.
 */
export function mergeFieldingFromCricApiJson(
  performances: CricApiMappedPerformance[],
  data: unknown,
): CricApiMappedPerformance[] {
  const byName = new Map(performances.map((p) => [normalizeName(p.playerName), p]));

  // Build a last-name index for partial-name matching (dismissals often use only last name)
  const byLastName = new Map<string, CricApiMappedPerformance[]>();
  for (const p of performances) {
    const parts = normalizeName(p.playerName).split(" ");
    const last = parts[parts.length - 1];
    if (last) {
      const arr = byLastName.get(last) ?? [];
      arr.push(p);
      byLastName.set(last, arr);
    }
  }

  function resolveFielder(fielderName: string): CricApiMappedPerformance | null {
    const key = normalizeName(fielderName);
    if (!key) return null;
    // Exact full name match
    const exact = byName.get(key);
    if (exact) return exact;
    // Last name match (dismissals often only say "Kohli" not "Virat Kohli")
    const lastParts = key.split(" ");
    const lastName = lastParts[lastParts.length - 1];
    const lastMatches = byLastName.get(lastName);
    if (lastMatches?.length === 1) return lastMatches[0];
    // If multiple last-name matches, try first initial disambiguation
    if (lastMatches && lastMatches.length > 1 && lastParts.length > 1) {
      const initial = lastParts[0][0];
      const disambig = lastMatches.filter((p) => normalizeName(p.playerName).startsWith(initial));
      if (disambig.length === 1) return disambig[0];
    }
    return null;
  }

  const fieldingCounts = new Map<string, { perf: CricApiMappedPerformance; catches: number; stumpings: number; runOutsDirect: number; runOutsThrower: number }>();

  function creditFielder(fielderName: string, type: FieldingCredit["type"]) {
    const perf = resolveFielder(fielderName);
    if (!perf) return;
    const key = normalizeName(perf.playerName);
    const cur = fieldingCounts.get(key) ?? { perf, catches: 0, stumpings: 0, runOutsDirect: 0, runOutsThrower: 0 };
    if (type === "catch") cur.catches++;
    else if (type === "stumping") cur.stumpings++;
    else if (type === "runOutDirect") cur.runOutsDirect++;
    else if (type === "runOutThrower") cur.runOutsThrower++;
    fieldingCounts.set(key, cur);
  }

  // Walk through every batting row in the payload and parse dismissal text
  function visit(node: unknown) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;

    // Parse dismissal text from batting rows
    const dismissal = getDismissalText(o);
    if (dismissal) {
      const credits = parseFieldingCredits(dismissal);
      for (const c of credits) creditFielder(c.fielderName, c.type);
    }

    // CricAPI v1 match_scorecard: explicit catching[] array
    const catching = o.catching ?? o.Catching ?? o.fielding ?? o.Fielding;
    if (Array.isArray(catching)) {
      for (const raw of catching) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const nameCandidate = r.fielder ?? r.name ?? r.player ?? r.Fielder;
        const fielderName = typeof nameCandidate === "string"
          ? str(nameCandidate)
          : (nameCandidate && typeof nameCandidate === "object"
            ? str((nameCandidate as Record<string, unknown>).name ?? "")
            : "");
        if (!fielderName) continue;
        const catches = num(r.catch ?? r.catches ?? r.c ?? 0);
        const stumpings = num(r.stumpiing ?? r.stumped ?? r.stumpings ?? r.st ?? 0);
        const runOuts = num(r.runout ?? r.runOut ?? r["run out"] ?? r.runouts ?? 0);
        // If explicit counts are provided, credit them directly
        if (catches > 0) {
          for (let i = 0; i < catches; i++) creditFielder(fielderName, "catch");
        }
        if (stumpings > 0) {
          for (let i = 0; i < stumpings; i++) creditFielder(fielderName, "stumping");
        }
        if (runOuts > 0) {
          for (let i = 0; i < runOuts; i++) creditFielder(fielderName, "runOutDirect");
        }
        // If no specific counts but entry exists, assume 1 catch (common CricAPI pattern)
        if (catches === 0 && stumpings === 0 && runOuts === 0) {
          creditFielder(fielderName, "catch");
        }
      }
    }

    for (const v of Object.values(o)) visit(v);
  }

  const root = typeof data === "object" && data !== null && "data" in (data as object)
    ? (data as { data: unknown }).data
    : data;
  visit(root);

  // Apply fielding counts to matching performances
  for (const [, counts] of fieldingCounts) {
    const hasFielding = counts.catches > 0 || counts.stumpings > 0 || counts.runOutsDirect > 0 || counts.runOutsThrower > 0;
    if (hasFielding) {
      counts.perf.stats = {
        ...counts.perf.stats,
        fielding: {
          catches: counts.catches || undefined,
          stumpings: counts.stumpings || undefined,
          runOutsDirect: counts.runOutsDirect || undefined,
          runOutsThrower: counts.runOutsThrower || undefined,
        },
      };
    }
  }

  return performances;
}
