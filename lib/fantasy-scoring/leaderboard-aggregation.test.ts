import { describe, expect, it } from "vitest";

/**
 * Tests for leaderboard aggregation logic (extracted from the Leaderboard component).
 * Verifies ranking, today's points calculation, and tie-breaking.
 */

type ScoreRow = {
  id: string;
  league_id: string;
  team_id: string | null;
  private_team_id: string | null;
  scoreboard_team_id: string;
  match_id: string;
  match_date: string;
  total_points: number;
  breakdown: Record<string, unknown>;
};

function aggregateLeaderboard(
  scores: ScoreRow[],
  teamIds: string[],
  todayDate?: string,
) {
  const totals = new Map<string, number>(teamIds.map((id) => [id, 0]));
  const todayPts = new Map<string, number>(teamIds.map((id) => [id, 0]));

  for (const s of scores) {
    totals.set(s.scoreboard_team_id, (totals.get(s.scoreboard_team_id) ?? 0) + Number(s.total_points));
    if (todayDate && s.match_date === todayDate) {
      todayPts.set(s.scoreboard_team_id, (todayPts.get(s.scoreboard_team_id) ?? 0) + Number(s.total_points));
    }
  }

  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return { rows, todayPts };
}

function makeScore(teamId: string, matchId: string, matchDate: string, points: number, isPrivate = true): ScoreRow {
  return {
    id: `${teamId}-${matchId}`,
    league_id: "league-1",
    team_id: isPrivate ? null : teamId,
    private_team_id: isPrivate ? teamId : null,
    scoreboard_team_id: teamId,
    match_id: matchId,
    match_date: matchDate,
    total_points: points,
    breakdown: {},
  };
}

describe("leaderboard aggregation", () => {
  const teamIds = ["team-a", "team-b", "team-c"];

  it("ranks teams by total points descending", () => {
    const scores = [
      makeScore("team-a", "m1", "2026-04-01", 50),
      makeScore("team-b", "m1", "2026-04-01", 80),
      makeScore("team-c", "m1", "2026-04-01", 30),
    ];
    const { rows } = aggregateLeaderboard(scores, teamIds);
    expect(rows[0][0]).toBe("team-b");
    expect(rows[0][1]).toBe(80);
    expect(rows[1][0]).toBe("team-a");
    expect(rows[2][0]).toBe("team-c");
  });

  it("accumulates points across multiple matches", () => {
    const scores = [
      makeScore("team-a", "m1", "2026-04-01", 50),
      makeScore("team-a", "m2", "2026-04-02", 30),
      makeScore("team-b", "m1", "2026-04-01", 40),
      makeScore("team-b", "m2", "2026-04-02", 60),
    ];
    const { rows } = aggregateLeaderboard(scores, teamIds);
    expect(rows[0][0]).toBe("team-b"); // 100
    expect(rows[0][1]).toBe(100);
    expect(rows[1][0]).toBe("team-a"); // 80
    expect(rows[1][1]).toBe(80);
  });

  it("computes today's points correctly", () => {
    const scores = [
      makeScore("team-a", "m1", "2026-04-01", 50),
      makeScore("team-a", "m2", "2026-04-02", 30),
      makeScore("team-b", "m1", "2026-04-01", 40),
      makeScore("team-b", "m2", "2026-04-02", 60),
    ];
    const { todayPts } = aggregateLeaderboard(scores, teamIds, "2026-04-02");
    expect(todayPts.get("team-a")).toBe(30);
    expect(todayPts.get("team-b")).toBe(60);
    expect(todayPts.get("team-c")).toBe(0); // no match today
  });

  it("handles no scores gracefully", () => {
    const { rows, todayPts } = aggregateLeaderboard([], teamIds, "2026-04-01");
    expect(rows.length).toBe(3);
    expect(rows.every(([, pts]) => pts === 0)).toBe(true);
    expect(todayPts.get("team-a")).toBe(0);
  });

  it("handles private_team_id-based scores (not auction team_id)", () => {
    const scores = [
      makeScore("pt-1", "m1", "2026-04-01", 75, true),
      makeScore("pt-2", "m1", "2026-04-01", 45, true),
    ];
    const { rows } = aggregateLeaderboard(scores, ["pt-1", "pt-2"]);
    expect(rows[0][0]).toBe("pt-1");
    expect(rows[0][1]).toBe(75);
  });

  it("handles ties by preserving insertion order", () => {
    const scores = [
      makeScore("team-a", "m1", "2026-04-01", 50),
      makeScore("team-b", "m1", "2026-04-01", 50),
    ];
    const { rows } = aggregateLeaderboard(scores, teamIds);
    // Both have 50 pts — sort is stable
    expect(rows[0][1]).toBe(50);
    expect(rows[1][1]).toBe(50);
  });

  it("handles multiple matches on the same day", () => {
    const scores = [
      makeScore("team-a", "m1", "2026-04-01", 30),
      makeScore("team-a", "m2", "2026-04-01", 25), // two matches same day
    ];
    const { todayPts } = aggregateLeaderboard(scores, teamIds, "2026-04-01");
    expect(todayPts.get("team-a")).toBe(55);
  });
});
