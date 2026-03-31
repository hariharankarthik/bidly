import type { DbPlayer } from "@/lib/cricapi/map-player-names";
import { matchDbPlayerForCricApiName } from "@/lib/cricapi/map-player-names";
import { detectDelimiter, parseDelimited } from "@/lib/csv/parse-delimited";

export type SheetColumnMapping = {
  /** Column header for player display name (required) */
  player_name: string;
  /** Optional: team name when one file has multiple teams */
  team?: string;
  /** Optional: captain / vice — values like C, VC, CAPT, VICE, * … */
  cvc?: string;
};

export type NormalizedSheetRow = {
  teamName: string;
  playerName: string;
  cvcRaw: string;
};

function normalizeCvc(raw: string): "c" | "vc" | "" {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  if (s === "c" || s === "capt" || s === "captain" || s === "(c)" || s === "*") return "c";
  if (s === "vc" || s === "vice" || s === "vice-captain" || s === "vic" || s === "(vc)") return "vc";
  return "";
}

/**
 * Parse pasted sheet text into rows using header → column indices from `mapping`.
 */
export function sheetTextToNormalizedRows(text: string, mapping: SheetColumnMapping): NormalizedSheetRow[] {
  const delim = detectDelimiter(text);
  const grid = parseDelimited(text.trim(), delim);
  if (grid.length < 2) return [];

  const headers = grid[0]!.map((h) => h.trim().toLowerCase());
  const findCol = (label: string) => {
    const want = label.trim().toLowerCase();
    const idx = headers.findIndex((h) => h === want);
    return idx >= 0 ? idx : -1;
  };

  const pi = findCol(mapping.player_name);
  if (pi < 0) return [];

  let ti = -1;
  if (mapping.team?.trim()) {
    ti = findCol(mapping.team.trim());
  }

  let ci = -1;
  if (mapping.cvc?.trim()) {
    ci = findCol(mapping.cvc.trim());
  }

  const defaultTeam = mapping.team?.trim() && ti < 0 ? mapping.team.trim() : "Team 1";

  const out: NormalizedSheetRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r]!;
    const playerName = (row[pi] ?? "").trim();
    if (!playerName) continue;
    const teamName = ti >= 0 ? (row[ti] ?? "").trim() || defaultTeam : defaultTeam;
    const cvcRaw = ci >= 0 ? (row[ci] ?? "").trim() : "";
    out.push({ teamName, playerName, cvcRaw });
  }
  return out;
}

export type BuiltPrivateTeam = {
  team_name: string;
  squad_player_ids: string[];
  captain_player_id: string | null;
  vice_captain_player_id: string | null;
};

export function buildPrivateTeamsFromRows(
  dbPlayers: DbPlayer[],
  rows: NormalizedSheetRow[],
): {
  teams: BuiltPrivateTeam[];
  unmatched: string[];
  duplicate_player_warnings: string[];
} {
  const byTeam = new Map<string, NormalizedSheetRow[]>();
  for (const row of rows) {
    const list = byTeam.get(row.teamName) ?? [];
    list.push(row);
    byTeam.set(row.teamName, list);
  }

  const globalAssigned = new Map<string, string>(); // player_id -> team_name
  const unmatched: string[] = [];
  const duplicate_player_warnings: string[] = [];

  const teams: BuiltPrivateTeam[] = [];

  for (const [teamName, teamRows] of byTeam) {
    const idSet = new Set<string>();
    let captain: string | null = null;
    let vice: string | null = null;

    for (const tr of teamRows) {
      const p = matchDbPlayerForCricApiName(dbPlayers, tr.playerName);
      if (!p) {
        unmatched.push(tr.playerName);
        continue;
      }
      const prev = globalAssigned.get(p.id);
      if (prev && prev !== teamName) {
        duplicate_player_warnings.push(`${tr.playerName} (${p.id.slice(0, 8)}…) already on ${prev}`);
        continue;
      }
      globalAssigned.set(p.id, teamName);

      if (idSet.has(p.id)) continue;
      idSet.add(p.id);

      const role = normalizeCvc(tr.cvcRaw);
      if (role === "c") {
        if (captain && captain !== p.id) duplicate_player_warnings.push(`Multiple captains for ${teamName} — using last`);
        captain = p.id;
      } else if (role === "vc") {
        if (vice && vice !== p.id) duplicate_player_warnings.push(`Multiple vice-captains for ${teamName} — using last`);
        vice = p.id;
      }
    }

    teams.push({
      team_name: teamName,
      squad_player_ids: [...idSet],
      captain_player_id: captain,
      vice_captain_player_id: vice,
    });
  }

  return { teams, unmatched: [...new Set(unmatched)], duplicate_player_warnings };
}
