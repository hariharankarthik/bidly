import type { PlayerMatchStats } from "@/lib/fantasy-scoring";
import { normalizeName } from "@/lib/cricapi/fetch-scorecard";

export type DbPlayer = { id: string; name: string };

/**
 * Map a single CricAPI/scorecard display name to one row in our players table.
 * Handles short initials (e.g. "V Kohli" → "Virat Kohli") when the last name is unique.
 */
export function matchDbPlayerForCricApiName(list: DbPlayer[], cricName: string): DbPlayer | null {
  const key = normalizeName(cricName);
  if (!key) return null;

  const exact = list.find((p) => normalizeName(p.name) === key);
  if (exact) return exact;

  const fuzzy = list.find(
    (p) =>
      key.length >= 4 &&
      (normalizeName(p.name).includes(key) || key.includes(normalizeName(p.name))),
  );
  if (fuzzy) return fuzzy;

  const parts = key.split(/\s+/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1]! : "";
  if (last.length < 4) return null;

  const lastNameMatches = list.filter((p) => {
    const pn = normalizeName(p.name);
    const pParts = pn.split(/\s+/).filter(Boolean);
    const pLast = pParts.length ? pParts[pParts.length - 1]! : "";
    return pLast === last;
  });
  if (lastNameMatches.length === 1) return lastNameMatches[0]!;

  if (parts.length >= 2 && parts[0]!.length <= 3 && last.length >= 4 && lastNameMatches.length > 0) {
    const initial = parts[0]!;
    const narrowed = lastNameMatches.filter((p) => {
      const pn = normalizeName(p.name);
      const firstWord = pn.split(/\s+/).filter(Boolean)[0] ?? "";
      return firstWord.startsWith(initial);
    });
    if (narrowed.length === 1) return narrowed[0]!;
    if (narrowed.length > 1) return null;
  }

  return null;
}

export type ExtractedRow = { playerName: string; stats: PlayerMatchStats };

export function mapCricApiExtractedToPerformances(
  list: DbPlayer[],
  extracted: ExtractedRow[],
): { performances: Array<{ player_id: string } & PlayerMatchStats>; unmatched: string[] } {
  const performances: Array<{ player_id: string } & PlayerMatchStats> = [];
  const unmatched: string[] = [];

  for (const row of extracted) {
    const p = matchDbPlayerForCricApiName(list, row.playerName);
    if (!p) {
      unmatched.push(row.playerName);
      continue;
    }
    performances.push({ player_id: p.id, ...row.stats });
  }

  return { performances, unmatched };
}
