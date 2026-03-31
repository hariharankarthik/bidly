"use client";

import type { LeagueTeamDisplay } from "@/lib/sports/types";
import type { ScoreRow } from "@/hooks/useLeaderboard";

export function Leaderboard({
  scores,
  teams,
  ownersByTeamId,
}: {
  scores: ScoreRow[];
  teams: LeagueTeamDisplay[];
  /** Optional: show owner display name separate from franchise/team name */
  ownersByTeamId?: Record<string, string>;
}) {
  const names = new Map(teams.map((t) => [t.id, t.team_name]));
  const totals = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (const s of scores) {
    totals.set(s.scoreboard_team_id, (totals.get(s.scoreboard_team_id) ?? 0) + Number(s.total_points));
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Leaderboard</h3>
      <ol className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-neutral-500">No scores yet — run a match calculation from the host tools.</li>
        ) : (
          rows.map(([teamId, pts], i) => (
            <li key={teamId} className="flex items-center justify-between text-sm">
              <span className="min-w-0 text-neutral-300">
                <span className="mr-2 text-neutral-500">{i + 1}.</span>{" "}
                <span className="truncate">{names.get(teamId) ?? teamId}</span>
                {ownersByTeamId?.[teamId] ? (
                  <span className="ml-2 text-xs text-neutral-500">· {ownersByTeamId[teamId]}</span>
                ) : null}
              </span>
              <span className="font-mono text-blue-200">{pts.toFixed(1)}</span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
