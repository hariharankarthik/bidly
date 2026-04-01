"use client";

import { useState } from "react";
import type { LeagueTeamDisplay } from "@/lib/sports/types";
import type { ScoreRow } from "@/hooks/useLeaderboard";

const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

type PlayerLine = {
  player_name?: string;
  player_id?: string;
  base_pts?: number;
  base_points?: number;
  multiplier?: number;
  effective_pts?: number;
  effective_points?: number;
};

export function MatchBreakdown({ scores, teams }: { scores: ScoreRow[]; teams: LeagueTeamDisplay[] }) {
  const names = new Map(teams.map((t) => [t.id, t.team_name]));

  // Group by date, then by match within each date
  const byDate = new Map<string, Map<string, ScoreRow[]>>();
  for (const s of scores) {
    if (!byDate.has(s.match_date)) byDate.set(s.match_date, new Map());
    const dateMap = byDate.get(s.match_date)!;
    if (!dateMap.has(s.match_id)) dateMap.set(s.match_id, []);
    dateMap.get(s.match_id)!.push(s);
  }
  const sortedDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Match breakdown</h3>
      <div className="mt-3 space-y-5">
        {sortedDates.length === 0 ? (
          <p className="text-sm text-neutral-500">No match rows yet.</p>
        ) : (
          sortedDates.map((date) => {
            const matches = byDate.get(date)!;
            const dateLabel = dateFmt.format(new Date(date + "T00:00:00"));
            return (
              <div key={date}>
                <p className="text-xs font-semibold text-neutral-400">{dateLabel}</p>
                <div className="mt-2 space-y-3">
                  {[...matches.entries()].map(([mid, rows]) => (
                    <div key={mid} className="space-y-1">
                      <p className="text-xs text-neutral-500">Match {mid}</p>
                      <ul className="space-y-1 text-sm">
                        {rows.map((r) => (
                          <MatchScoreRow key={r.id} row={r} teamName={names.get(r.scoreboard_team_id) ?? r.scoreboard_team_id} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MatchScoreRow({ row, teamName }: { row: ScoreRow; teamName: string }) {
  const playerLines = (row.breakdown?.player_lines ?? null) as PlayerLine[] | null;
  const [open, setOpen] = useState(false);

  return (
    <li className="list-none">
      <div className="flex justify-between gap-2">
        <button
          type="button"
          className={`min-w-0 text-left ${playerLines ? "cursor-pointer hover:text-neutral-100" : "cursor-default"} text-neutral-300`}
          onClick={() => playerLines && setOpen((v) => !v)}
        >
          {teamName}
          {playerLines ? <span className="ml-1 text-xs text-neutral-500">{open ? "▾" : "▸"}</span> : null}
        </button>
        <span className="font-mono text-neutral-200">{Number(row.total_points).toFixed(1)}</span>
      </div>
      {open && playerLines ? (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-neutral-800 pl-3">
          {playerLines.map((pl, i) => (
            <div key={i} className="flex justify-between gap-3 text-xs text-neutral-400">
              <span className="min-w-0 truncate">{pl.player_name ?? pl.player_id ?? "Unknown"}</span>
              <span className="flex shrink-0 gap-2 font-mono">
                <span>{(pl.base_pts ?? pl.base_points ?? 0).toFixed(1)}</span>
                <span className="text-neutral-500">×{pl.multiplier ?? 1}</span>
                <span className="text-neutral-200">{(pl.effective_pts ?? pl.effective_points ?? 0).toFixed(1)}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}
