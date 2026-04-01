/**
 * Replay private-league fantasy scoring for one CricAPI match and compare to fantasy_scores.
 *
 * Usage (from repo root, .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRICAPI_KEY):
 *   npx --yes tsx --tsconfig tsconfig.json scripts/verify-private-league-scoring.ts \
 *     --league-id <fantasy_leagues.id> \
 *     --cricapi-match-id e02475c1-8f9a-4915-a9e8-d4dbc3441c96 \
 *     --match-date 2026-03-29
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchScorecardWithFallback } from "../lib/scoring/fetch-with-fallback";
import { mapCricApiExtractedToPerformances } from "../lib/cricapi/map-player-names";
import { scorePlayerMatch, type PlayerMatchStats } from "../lib/fantasy-scoring";
import { effectivePointsWithLineup } from "../lib/fantasy-scoring/lineup-multipliers";
import { parseCricApiMatchUuid } from "../lib/cricapi/match-id";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1]!;
}

type TeamLineupRow = {
  id: string;
  team_name: string;
  starting_xi_player_ids: string[] | null;
  captain_player_id: string | null;
  vice_captain_player_id: string | null;
};

async function main() {
  loadEnvLocal();

  const leagueId = arg("--league-id");
  const cricapiRaw = arg("--cricapi-match-id");
  const matchDate = arg("--match-date");
  if (!leagueId || !cricapiRaw || !matchDate) {
    console.error("Usage: ... --league-id UUID --cricapi-match-id UUID --match-date YYYY-MM-DD");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const effectiveMatchId = parseCricApiMatchUuid(cricapiRaw);
  const supabase: SupabaseClient = createClient(url, key);

  const { data: league, error: lErr } = await supabase
    .from("fantasy_leagues")
    .select("id, sport_id, league_kind, name")
    .eq("id", leagueId)
    .single();
  if (lErr || !league) {
    console.error("League not found:", lErr?.message);
    process.exit(1);
  }
  if (league.league_kind !== "private") {
    console.error("This script is for private leagues only.");
    process.exit(1);
  }

  const { data: pteams, error: ptErr } = await supabase
    .from("private_league_teams")
    .select(
      "id, team_name, squad_player_ids, starting_xi_player_ids, captain_player_id, vice_captain_player_id",
    )
    .eq("league_id", leagueId);
  if (ptErr) {
    console.error(ptErr.message);
    process.exit(1);
  }

  const teamList: TeamLineupRow[] = (pteams ?? []).map((t) => ({
    id: t.id,
    team_name: t.team_name,
    starting_xi_player_ids: Array.isArray(t.starting_xi_player_ids) ? (t.starting_xi_player_ids as string[]) : [],
    captain_player_id: (t.captain_player_id as string | null) ?? null,
    vice_captain_player_id: (t.vice_captain_player_id as string | null) ?? null,
  }));

  const playerToTeam = new Map<string, string>();
  for (const t of pteams ?? []) {
    for (const pid of (t.squad_player_ids as string[] | null) ?? []) {
      playerToTeam.set(pid, t.id);
    }
  }

  const { data: dbPlayers, error: plErr } = await supabase
    .from("players")
    .select("id, name")
    .eq("sport_id", league.sport_id);
  if (plErr) {
    console.error(plErr.message);
    process.exit(1);
  }

  const nameById = new Map((dbPlayers ?? []).map((p) => [p.id, p.name]));

  console.log("League:", league.name);
  console.log("Sport:", league.sport_id);
  console.log("CricAPI match id:", effectiveMatchId);
  console.log("Match date:", matchDate);
  console.log("--- Fetch scorecard ---");

  const result = await fetchScorecardWithFallback({
    matchId: effectiveMatchId,
    matchDate,
    supabase,
  });
  console.log("Provider:", result.provider, "| extracted players:", result.performances.length);

  const mapped = mapCricApiExtractedToPerformances(dbPlayers ?? [], result.performances);
  if (mapped.unmatched.length) {
    console.log("Unmatched CricAPI names (no fantasy points from these rows):", mapped.unmatched.length);
    console.log(mapped.unmatched.slice(0, 30).join(", "), mapped.unmatched.length > 30 ? "…" : "");
  }

  type Line = {
    player_id: string;
    name: string;
    team_id: string;
    franchise: string;
    base: number;
    mult: number;
    effective: number;
  };
  const lines: Line[] = [];
  const agg = new Map<string, number>();
  for (const t of teamList) agg.set(t.id, 0);

  const lineupByTeam = new Map(teamList.map((t) => [t.id, t]));

  for (const row of mapped.performances) {
    const teamId = playerToTeam.get(row.player_id);
    if (!teamId) continue;

    const stats: PlayerMatchStats = {
      batting: row.batting,
      bowling: row.bowling,
      fielding: row.fielding,
    };
    if (!stats.batting && !stats.bowling && !stats.fielding) continue;

    const { total: baseTotal } = scorePlayerMatch(stats);
    const teamRow = lineupByTeam.get(teamId)!;
    const xi = teamRow.starting_xi_player_ids ?? [];
    const { effective, counted, multiplier } = effectivePointsWithLineup(baseTotal, row.player_id, {
      startingXiPlayerIds: xi.filter(Boolean),
      captainPlayerId: teamRow.captain_player_id,
      viceCaptainPlayerId: teamRow.vice_captain_player_id,
    });
    if (!counted) continue;

    const franchise = teamRow.team_name;
    lines.push({
      player_id: row.player_id,
      name: nameById.get(row.player_id) ?? row.player_id,
      team_id: teamId,
      franchise,
      base: baseTotal,
      mult: multiplier,
      effective,
    });
    agg.set(teamId, (agg.get(teamId) ?? 0) + effective);
  }

  console.log("--- Computed franchise totals (this script) ---");
  for (const t of teamList.sort((a, b) => (agg.get(b.id) ?? 0) - (agg.get(a.id) ?? 0))) {
    const total = Math.round((agg.get(t.id) ?? 0) * 100) / 100;
    console.log(`${t.team_name}: ${total.toFixed(1)}`);
  }

  console.log("--- Stored fantasy_scores (Supabase) ---");
  const { data: stored, error: fsErr } = await supabase
    .from("fantasy_scores")
    .select("private_team_id, total_points, breakdown")
    .eq("league_id", leagueId)
    .eq("match_id", effectiveMatchId);
  if (fsErr) {
    console.error(fsErr.message);
  } else if (!stored?.length) {
    console.log("(no rows for this league_id + match_id)");
  } else {
    const byPriv = new Map(stored.map((r) => [r.private_team_id as string, r]));
    for (const t of teamList) {
      const row = byPriv.get(t.id);
      const storedPts = row ? Number(row.total_points) : null;
      const computed = Math.round((agg.get(t.id) ?? 0) * 100) / 100;
      const ok = storedPts != null && Math.abs(storedPts - computed) < 0.05;
      console.log(
        `${t.team_name}: DB=${storedPts?.toFixed(1) ?? "—"}  script=${computed.toFixed(1)}  ${ok ? "✓" : "≠ MISMATCH"}`,
      );
    }
  }

  console.log("--- Top 12 player lines by effective points ---");
  lines.sort((a, b) => b.effective - a.effective);
  for (const l of lines.slice(0, 12)) {
    console.log(
      `${l.effective.toFixed(1)} pts (base ${l.base.toFixed(1)} × ${l.mult}) · ${l.name} · ${l.franchise}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
