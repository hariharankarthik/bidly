"use client";

import type { LeagueTeamDisplay } from "@/lib/sports/types";
import type { ScoreRow } from "@/hooks/useLeaderboard";

export function Leaderboard({
  scores,
  teams,
  ownersByTeamId,
  todayDate,
  myTeamId,
}: {
  scores: ScoreRow[];
  teams: LeagueTeamDisplay[];
  /** Optional: show owner display name separate from franchise/team name */
  ownersByTeamId?: Record<string, string>;
  /** ISO date string (YYYY-MM-DD) to compute today's points */
  todayDate?: string;
  /** Highlight the user's team row */
  myTeamId?: string;
}) {
  const names = new Map(teams.map((t) => [t.id, t.team_name]));
  const totals = new Map<string, number>(teams.map((t) => [t.id, 0]));
  const todayPts = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (const s of scores) {
    totals.set(s.scoreboard_team_id, (totals.get(s.scoreboard_team_id) ?? 0) + Number(s.total_points));
    if (todayDate && s.match_date === todayDate) {
      todayPts.set(s.scoreboard_team_id, (todayPts.get(s.scoreboard_team_id) ?? 0) + Number(s.total_points));
    }
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Leaderboard</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No scores yet — run a match calculation from the host tools.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-xs text-neutral-500">
                <th className="pb-2 pr-2 text-left font-medium">#</th>
                <th className="pb-2 pr-2 text-left font-medium">Team</th>
                <th className="pb-2 pr-2 text-left font-medium">Owner</th>
                {todayDate ? <th className="pb-2 pl-2 text-right font-medium">Today</th> : null}
                <th className="pb-2 pl-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([teamId, pts], i) => (
                <tr
                  key={teamId}
                  className={`border-b border-neutral-800/50 last:border-0 ${myTeamId === teamId ? "bg-blue-950/30" : ""}`}
                >
                  <td className="py-2 pr-2 text-neutral-500">{i + 1}</td>
                  <td className="py-2 pr-2 text-neutral-300 truncate max-w-[10rem]">{names.get(teamId) ?? teamId}</td>
                  <td className="py-2 pr-2 text-neutral-500">{ownersByTeamId?.[teamId] ?? "—"}</td>
                  {todayDate ? (
                    <td className="py-2 pl-2 text-right font-mono text-neutral-300">{(todayPts.get(teamId) ?? 0).toFixed(1)}</td>
                  ) : null}
                  <td className="py-2 pl-2 text-right font-mono text-blue-200">{pts.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
