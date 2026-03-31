"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LeagueTeamDisplay } from "@/lib/sports/types";
import type { ScoreRow } from "@/hooks/useLeaderboard";

export function PointsChart({ scores, teams }: { scores: ScoreRow[]; teams: LeagueTeamDisplay[] }) {
  const teamIds = teams.map((t) => t.id);

  const data = useMemo(() => {
    const byMatch = new Map<string, Record<string, string | number>>();
    for (const s of scores) {
      const row = byMatch.get(s.match_id) ?? { match: s.match_id };
      row[s.scoreboard_team_id] = Number(s.total_points);
      byMatch.set(s.match_id, row);
    }
    return [...byMatch.values()].sort((a, b) => String(a.match).localeCompare(String(b.match)));
  }, [scores]);

  const colors = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171"];

  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">Chart appears once match scores exist.</p>;
  }

  return (
    <div className="h-72 w-full rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Points by match</h3>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="match" stroke="#888" fontSize={11} />
          <YAxis stroke="#888" fontSize={11} />
          <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid #333" }} />
          {teamIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={teams.find((t) => t.id === id)?.team_name ?? id}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
