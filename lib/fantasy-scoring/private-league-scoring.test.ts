import { describe, expect, it } from "vitest";
import { effectivePointsWithLineup } from "./lineup-multipliers";
import { scorePlayerMatch, type PlayerMatchStats } from "./auctionroom-ipl";

/**
 * Tests verifying fantasy scoring works correctly for private league scenarios:
 * - XI gating: only XI players get points
 * - Captain 2× / VC 1.5× multipliers
 * - Squad without XI set: all players score
 * - Mixed overseas/domestic lineups
 */

describe("private league scoring", () => {
  const makeStats = (runs: number): PlayerMatchStats => ({
    batting: { runs, ballsFaced: runs + 10, fours: Math.floor(runs / 10), sixes: 0, dismissed: false, playedInStartingXi: true },
  });

  describe("XI gating for private teams", () => {
    const xi = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"];

    it("scores XI players normally", () => {
      const { total } = scorePlayerMatch(makeStats(30));
      const { effective, counted } = effectivePointsWithLineup(total, "p1", {
        startingXiPlayerIds: xi,
        captainPlayerId: "p1",
        viceCaptainPlayerId: "p2",
      });
      expect(counted).toBe(true);
      expect(effective).toBe(total * 2); // captain 2×
    });

    it("gives 0 to bench players when XI is set", () => {
      const { total } = scorePlayerMatch(makeStats(100));
      const { effective, counted } = effectivePointsWithLineup(total, "bench_player", {
        startingXiPlayerIds: xi,
        captainPlayerId: "p1",
        viceCaptainPlayerId: "p2",
      });
      expect(counted).toBe(false);
      expect(effective).toBe(0);
    });

    it("captain gets exactly 2× base points", () => {
      const base = 50;
      const { effective, multiplier } = effectivePointsWithLineup(base, "p1", {
        startingXiPlayerIds: xi,
        captainPlayerId: "p1",
        viceCaptainPlayerId: "p2",
      });
      expect(multiplier).toBe(2);
      expect(effective).toBe(100);
    });

    it("vice-captain gets exactly 1.5× base points", () => {
      const base = 40;
      const { effective, multiplier } = effectivePointsWithLineup(base, "p2", {
        startingXiPlayerIds: xi,
        captainPlayerId: "p1",
        viceCaptainPlayerId: "p2",
      });
      expect(multiplier).toBe(1.5);
      expect(effective).toBe(60);
    });

    it("regular XI player gets 1× base points", () => {
      const base = 30;
      const { effective, multiplier } = effectivePointsWithLineup(base, "p5", {
        startingXiPlayerIds: xi,
        captainPlayerId: "p1",
        viceCaptainPlayerId: "p2",
      });
      expect(multiplier).toBe(1);
      expect(effective).toBe(30);
    });
  });

  describe("no XI set (empty array)", () => {
    it("all squad players score when XI is empty", () => {
      const base = 25;
      const { effective, counted } = effectivePointsWithLineup(base, "any_player", {
        startingXiPlayerIds: [],
        captainPlayerId: null,
        viceCaptainPlayerId: null,
      });
      expect(counted).toBe(true);
      expect(effective).toBe(25);
    });

    it("captain still gets 2× when XI is empty", () => {
      const base = 40;
      const { effective, multiplier } = effectivePointsWithLineup(base, "cap", {
        startingXiPlayerIds: [],
        captainPlayerId: "cap",
        viceCaptainPlayerId: "vc",
      });
      expect(multiplier).toBe(2);
      expect(effective).toBe(80);
    });
  });

  describe("aggregate team scoring simulation", () => {
    it("correctly aggregates points for a full private team", () => {
      const xi = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"];
      const squad = [...xi, "p12", "p13", "p14", "p15"]; // 15 players, 11 in XI
      const captainId = "p1";
      const vcId = "p2";

      let teamTotal = 0;
      let countedPlayers = 0;

      for (const pid of squad) {
        const { total: baseTotal } = scorePlayerMatch(makeStats(20));
        const { effective, counted } = effectivePointsWithLineup(baseTotal, pid, {
          startingXiPlayerIds: xi,
          captainPlayerId: captainId,
          viceCaptainPlayerId: vcId,
        });
        if (counted) {
          teamTotal += effective;
          countedPlayers++;
        }
      }

      expect(countedPlayers).toBe(11); // only XI players counted
      expect(teamTotal).toBeGreaterThan(0);
    });
  });
});

describe("cron XI completeness gate", () => {
  type TeamRow = {
    id: string;
    claimed_by: string | null;
    xi_confirmed_at: string | null;
    starting_xi_player_ids: string[];
  };

  function shouldScore(league: { started_at: string | null }, teams: TeamRow[]): boolean {
    if (league.started_at) {
      const claimedWithoutXi = teams.filter((t) => t.claimed_by && !t.xi_confirmed_at);
      if (claimedWithoutXi.length > 0) return false;
    }
    return true;
  }

  it("skips scoring when a claimed team has never set XI (new league)", () => {
    const league = { started_at: "2025-04-01T00:00:00Z" };
    const teams: TeamRow[] = [
      { id: "t1", claimed_by: "u1", xi_confirmed_at: "2025-04-01T01:00:00Z", starting_xi_player_ids: ["p1"] },
      { id: "t2", claimed_by: "u2", xi_confirmed_at: null, starting_xi_player_ids: [] },
    ];
    expect(shouldScore(league, teams)).toBe(false);
  });

  it("proceeds when all claimed teams have confirmed XI", () => {
    const league = { started_at: "2025-04-01T00:00:00Z" };
    const teams: TeamRow[] = [
      { id: "t1", claimed_by: "u1", xi_confirmed_at: "2025-04-01T01:00:00Z", starting_xi_player_ids: ["p1"] },
      { id: "t2", claimed_by: "u2", xi_confirmed_at: "2025-04-01T02:00:00Z", starting_xi_player_ids: ["p2"] },
    ];
    expect(shouldScore(league, teams)).toBe(true);
  });

  it("unclaimed teams do not block scoring", () => {
    const league = { started_at: "2025-04-01T00:00:00Z" };
    const teams: TeamRow[] = [
      { id: "t1", claimed_by: "u1", xi_confirmed_at: "2025-04-01T01:00:00Z", starting_xi_player_ids: ["p1"] },
      { id: "t2", claimed_by: null, xi_confirmed_at: null, starting_xi_player_ids: [] },
    ];
    expect(shouldScore(league, teams)).toBe(true);
  });

  it("team that changed XI still has xi_confirmed_at — not blocked", () => {
    const league = { started_at: "2025-04-01T00:00:00Z" };
    const teams: TeamRow[] = [
      { id: "t1", claimed_by: "u1", xi_confirmed_at: "2025-04-01T01:00:00Z", starting_xi_player_ids: ["p3", "p4"] },
    ];
    expect(shouldScore(league, teams)).toBe(true);
  });

  it("legacy leagues (no started_at) use backward-compat scoring", () => {
    const league = { started_at: null };
    const teams: TeamRow[] = [
      { id: "t1", claimed_by: "u1", xi_confirmed_at: null, starting_xi_player_ids: [] },
      { id: "t2", claimed_by: "u2", xi_confirmed_at: null, starting_xi_player_ids: [] },
    ];
    expect(shouldScore(league, teams)).toBe(true);
  });
});
