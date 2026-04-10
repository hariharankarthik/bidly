"use client";

import type { LeagueTeamDisplay } from "@/lib/sports/types";
import type { ScoreRow, MatchMeta } from "@/hooks/useLeaderboard";

export function Leaderboard({
  scores,
  teams,
  ownersByTeamId,
  matchMeta,
  myTeamId,
}: {
  scores: ScoreRow[];
  teams: LeagueTeamDisplay[];
  /** Optional: show owner display name separate from franchise/team name */
  ownersByTeamId?: Record<string, string>;
  /** Match metadata for finding last match info */
  matchMeta?: Record<string, MatchMeta>;
  /** Highlight the user's team row */
  myTeamId?: string;
}) {
  const names = new Map(teams.map((t) => [t.id, t.team_name]));
  const totals = new Map<string, number>(teams.map((t) => [t.id, 0]));

  // Find the most recent match by date
  let lastMatchDate = "";
  let lastMatchIds: string[] = [];
  for (const s of scores) {
    const date = matchMeta?.[s.match_id]?.match_date || s.match_date;
    if (date > lastMatchDate) {
      lastMatchDate = date;
      lastMatchIds = [s.match_id];
    } else if (date === lastMatchDate && !lastMatchIds.includes(s.match_id)) {
      lastMatchIds.push(s.match_id);
    }
  }
  const lastMatchIdSet = new Set(lastMatchIds);

  // Compute last match points per team
  const lastMatchPts = new Map<string, number>(teams.map((t) => [t.id, 0]));
  for (const s of scores) {
    totals.set(s.scoreboard_team_id, (totals.get(s.scoreboard_team_id) ?? 0) + Number(s.total_points));
    if (lastMatchIdSet.has(s.match_id)) {
      lastMatchPts.set(s.scoreboard_team_id, (lastMatchPts.get(s.scoreboard_team_id) ?? 0) + Number(s.total_points));
    }
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  // Build last match label (e.g. "Apr 9 · CSK vs MI")
  const lastMatchLabel = lastMatchIds.length > 0
    ? lastMatchIds.map((id) => {
        const meta = matchMeta?.[id];
        return meta?.display_name ?? id;
      }).join(", ")
    : "";
  const lastDateFormatted = lastMatchDate
    ? new Date(lastMatchDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  const hasLastMatch = lastMatchIds.length > 0;

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
                {hasLastMatch ? (
                  <th className="pb-2 pl-2 text-right font-medium">
                    <div className="flex flex-col items-end">
                      <span>Last Match</span>
                      <span className="text-[10px] text-neutral-600 font-normal max-w-[8rem] truncate" title={`${lastDateFormatted} · ${lastMatchLabel}`}>
                        {lastDateFormatted} · {lastMatchLabel}
                      </span>
                    </div>
                  </th>
                ) : null}
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
                  {hasLastMatch ? (
                    <td className="py-2 pl-2 text-right font-mono text-neutral-300">{(lastMatchPts.get(teamId) ?? 0).toFixed(1)}</td>
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
