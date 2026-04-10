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
import type { ScoreRow, MatchMeta } from "@/hooks/useLeaderboard";

/** Format YYYY-MM-DD → "Mar 22" style */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Shorten team name: "Royal Challengers Bengaluru" → "RCB"-style abbreviation or first word */
function shortenTeam(name: string): string {
  const words = name.split(/\s+/);
  if (words.length <= 1) return name;
  // Use initials for multi-word names (e.g. "Mumbai Indians" → "MI")
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function PointsChart({ scores, teams, matchNames, matchMeta }: { scores: ScoreRow[]; teams: LeagueTeamDisplay[]; matchNames?: Record<string, string>; matchMeta?: Record<string, MatchMeta> }) {
  const teamIds = teams.map((t) => t.id);

  const data = useMemo(() => {
    // Group scores by match_id, include date for sorting
    const byMatch = new Map<string, { row: Record<string, string | number>; date: string }>();
    for (const s of scores) {
      const meta = matchMeta?.[s.match_id];
      const date = meta?.match_date || s.match_date;
      const displayName = meta?.display_name ?? matchNames?.[s.match_id] ?? s.match_id;

      // Build x-axis label: "Apr 9 · MI vs CSK"
      const shortTeams = displayName.includes(" vs ")
        ? displayName.split(" vs ").map((t) => shortenTeam(t.trim())).join(" vs ")
        : displayName;
      const label = date ? `${formatShortDate(date)} · ${shortTeams}` : shortTeams;

      const entry = byMatch.get(s.match_id) ?? { row: { match: label }, date };
      entry.row[s.scoreboard_team_id] = Number(s.total_points);
      byMatch.set(s.match_id, entry);
    }
    // Sort chronologically by match_date, then by label for same-day matches
    return [...byMatch.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.row.match).localeCompare(String(b.row.match)))
      .map((e) => e.row);
  }, [scores, matchNames, matchMeta]);

  const colors = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171"];

  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">Chart appears once match scores exist.</p>;
  }

  return (
    <div className="h-80 w-full rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Points by match</h3>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="match"
            stroke="#888"
            fontSize={10}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={60}
            tick={{ fill: "#888" }}
          />
          <YAxis stroke="#888" fontSize={11} />
          <Tooltip
            contentStyle={{ background: "#0a0a0b", border: "1px solid #333", fontSize: 12 }}
            labelStyle={{ color: "#ccc", marginBottom: 4 }}
          />
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
