"use client";

import type { LeagueTeamDisplay } from "@/lib/sports/types";
import type { ScoreRow } from "@/hooks/useLeaderboard";

export function MatchBreakdown({ scores, teams }: { scores: ScoreRow[]; teams: LeagueTeamDisplay[] }) {
  const names = new Map(teams.map((t) => [t.id, t.team_name]));
  const byMatch = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    const list = byMatch.get(s.match_id) ?? [];
    list.push(s);
    byMatch.set(s.match_id, list);
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Match breakdown</h3>
      <div className="mt-3 space-y-4">
        {[...byMatch.entries()].length === 0 ? (
          <p className="text-sm text-neutral-500">No match rows yet.</p>
        ) : (
          [...byMatch.entries()].map(([mid, rows]) => (
            <div key={mid}>
              <p className="text-xs text-neutral-400">Match {mid}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {rows.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span>{names.get(r.scoreboard_team_id) ?? r.scoreboard_team_id}</span>
                    <span className="font-mono text-neutral-200">{Number(r.total_points).toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
