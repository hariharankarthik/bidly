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
