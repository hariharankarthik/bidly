import type { PlayerMatchStats } from "@/lib/fantasy-scoring";
import { normalizeName } from "@/lib/cricapi/fetch-scorecard";

export type DbPlayer = { id: string; name: string; name_aliases?: string[] | null };

/** Normalize with extra cleanup: strip dots, hyphens, apostrophes */
function deepNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein edit distance between two strings */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

/** Similarity ratio: 0..1 (1 = identical) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - editDistance(a, b) / maxLen;
}

/**
 * Map a single CricAPI/scorecard display name to one row in our players table.
 * Returns the matched player and whether it was a fuzzy/alias match.
 */
export function matchDbPlayerForCricApiName(
  list: DbPlayer[],
  cricName: string,
): { player: DbPlayer; method: string } | null {
  const key = normalizeName(cricName);
  if (!key) return null;

  // Stage 0: Check name_aliases (exact match on any alias)
  const aliasMatch = list.find((p) =>
    (p.name_aliases ?? []).some((a) => normalizeName(a) === key),
  );
  if (aliasMatch) return { player: aliasMatch, method: "alias" };

  // Stage 1: Exact normalized match
  const exact = list.find((p) => normalizeName(p.name) === key);
  if (exact) return { player: exact, method: "exact" };

  // Stage 1b: Deep normalize (strip dots, hyphens, apostrophes)
  const deepKey = deepNormalize(cricName);
  const deepExact = list.find((p) => deepNormalize(p.name) === deepKey);
  if (deepExact) return { player: deepExact, method: "deep_exact" };

  // Stage 2: Fuzzy substring match (both directions)
  const fuzzy = list.find(
    (p) =>
      key.length >= 4 &&
      (normalizeName(p.name).includes(key) || key.includes(normalizeName(p.name))),
  );
  if (fuzzy) return { player: fuzzy, method: "substring" };

  const parts = key.split(/\s+/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1]! : "";

  // Stage 3: Last name match (unique)
  const lastNameMatches = list.filter((p) => {
    const pn = normalizeName(p.name);
    const pParts = pn.split(/\s+/).filter(Boolean);
    const pLast = pParts.length ? pParts[pParts.length - 1]! : "";
    return pLast === last;
  });

  // For short last names (< 4 chars), try full-string contains before giving up
  if (last.length < 4) {
    if (lastNameMatches.length === 1) return { player: lastNameMatches[0]!, method: "last_name" };
    const containsMatch = list.filter((p) => deepNormalize(p.name).includes(deepKey));
    if (containsMatch.length === 1) return { player: containsMatch[0]!, method: "contains" };
    if (lastNameMatches.length === 0) {
      // Fall through to Levenshtein
    }
  } else {
    if (lastNameMatches.length === 1) return { player: lastNameMatches[0]!, method: "last_name" };
  }

  // Stage 4: Initial + last name disambiguation
  if (parts.length >= 2 && parts[0]!.length <= 3 && lastNameMatches.length > 0) {
    const initial = parts[0]!;
    const narrowed = lastNameMatches.filter((p) => {
      const pn = normalizeName(p.name);
      const firstWord = pn.split(/\s+/).filter(Boolean)[0] ?? "";
      return firstWord.startsWith(initial);
    });
    if (narrowed.length === 1) return { player: narrowed[0]!, method: "initial_last" };

    if (narrowed.length === 0 && initial.length >= 2) {
      const prefix2 = initial.slice(0, 2);
      const byPrefix = lastNameMatches.filter((p) => {
        const pn = normalizeName(p.name);
        const firstWord = pn.split(/\s+/).filter(Boolean)[0] ?? "";
        return firstWord.startsWith(prefix2);
      });
      if (byPrefix.length === 1) return { player: byPrefix[0]!, method: "prefix2_last" };
    }
  }

  // Stage 5: Levenshtein fuzzy match — catches spelling variations
  // (e.g. "Sooryavanshi" vs "Suryavanshi")
  // Only accept if: similarity > 0.75, exactly one candidate above threshold,
  // and first name matches (to avoid cross-player matches)
  const SIMILARITY_THRESHOLD = 0.75;
  const candidates: { player: DbPlayer; sim: number }[] = [];
  for (const p of list) {
    const sim = similarity(deepKey, deepNormalize(p.name));
    if (sim >= SIMILARITY_THRESHOLD) {
      candidates.push({ player: p, sim });
    }
  }
  if (candidates.length === 1) {
    return { player: candidates[0]!.player, method: "levenshtein" };
  }
  // If multiple candidates, try to disambiguate by first name
  if (candidates.length > 1 && parts.length >= 2) {
    const firstName = parts[0]!;
    const byFirst = candidates.filter((c) => {
      const pFirst = normalizeName(c.player.name).split(/\s+/)[0] ?? "";
      return pFirst.startsWith(firstName) || firstName.startsWith(pFirst);
    });
    if (byFirst.length === 1) {
      return { player: byFirst[0]!.player, method: "levenshtein_first" };
    }
  }

  return null;
}

export type ExtractedRow = { playerName: string; stats: PlayerMatchStats };

export type AutoCorrection = {
  player_id: string;
  db_name: string;
  cricapi_name: string;
  method: string;
};

export function mapCricApiExtractedToPerformances(
  list: DbPlayer[],
  extracted: ExtractedRow[],
): {
  performances: Array<{ player_id: string } & PlayerMatchStats>;
  unmatched: string[];
  autoCorrections: AutoCorrection[];
} {
  const performances: Array<{ player_id: string } & PlayerMatchStats> = [];
  const unmatched: string[] = [];
  const autoCorrections: AutoCorrection[] = [];

  for (const row of extracted) {
    const result = matchDbPlayerForCricApiName(list, row.playerName);
    if (!result) {
      unmatched.push(row.playerName);
      continue;
    }
    performances.push({ player_id: result.player.id, ...row.stats });

    // Track fuzzy matches that should be saved as aliases
    if (result.method === "levenshtein" || result.method === "levenshtein_first") {
      autoCorrections.push({
        player_id: result.player.id,
        db_name: result.player.name,
        cricapi_name: row.playerName,
        method: result.method,
      });
    }
  }

  return { performances, unmatched, autoCorrections };
}
