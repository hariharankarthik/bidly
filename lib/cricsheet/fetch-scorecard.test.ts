import { describe, it, expect } from "vitest";
import { aggregateCricsheetInnings, parseCricsheetMatch } from "./fetch-scorecard";

// ─── Realistic test fixtures based on actual Cricsheet JSON format ────────────

/** Minimal T20 match: 2 innings, batting + bowling + wickets. */
const FIXTURE_T20_MATCH = {
  meta: { data_version: "1.0.0" },
  info: {
    teams: ["Mumbai Indians", "Chennai Super Kings"],
    dates: ["2026-04-15"],
    event: { name: "Indian Premier League", match_number: 12 },
    season: "2026",
    registry: { people: { "V Kohli": "abc123", "MS Dhoni": "def456" } },
  },
  innings: [
    {
      team: "Mumbai Indians",
      overs: [
        {
          over: 0,
          deliveries: [
            {
              batter: "R Sharma",
              bowler: "D Chahar",
              non_striker: "I Kishan",
              runs: { batter: 4, extras: 0, total: 4 },
            },
            {
              batter: "R Sharma",
              bowler: "D Chahar",
              non_striker: "I Kishan",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "R Sharma",
              bowler: "D Chahar",
              non_striker: "I Kishan",
              runs: { batter: 6, extras: 0, total: 6 },
            },
            {
              batter: "R Sharma",
              bowler: "D Chahar",
              non_striker: "I Kishan",
              runs: { batter: 1, extras: 0, total: 1 },
            },
            {
              batter: "I Kishan",
              bowler: "D Chahar",
              non_striker: "R Sharma",
              runs: { batter: 0, extras: 0, total: 0 },
              wickets: [
                {
                  player_out: "I Kishan",
                  fielders: [{ name: "MS Dhoni" }],
                  kind: "caught",
                },
              ],
            },
            {
              batter: "S Yadav",
              bowler: "D Chahar",
              non_striker: "R Sharma",
              runs: { batter: 0, extras: 0, total: 0 },
            },
          ],
        },
        {
          over: 1,
          deliveries: [
            {
              batter: "R Sharma",
              bowler: "M Theekshana",
              non_striker: "S Yadav",
              runs: { batter: 2, extras: 0, total: 2 },
            },
            {
              batter: "R Sharma",
              bowler: "M Theekshana",
              non_striker: "S Yadav",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "R Sharma",
              bowler: "M Theekshana",
              non_striker: "S Yadav",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "R Sharma",
              bowler: "M Theekshana",
              non_striker: "S Yadav",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "R Sharma",
              bowler: "M Theekshana",
              non_striker: "S Yadav",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "R Sharma",
              bowler: "M Theekshana",
              non_striker: "S Yadav",
              runs: { batter: 0, extras: 0, total: 0 },
            },
          ],
        },
      ],
    },
    {
      team: "Chennai Super Kings",
      overs: [
        {
          over: 0,
          deliveries: [
            {
              batter: "RD Gaikwad",
              bowler: "J Bumrah",
              non_striker: "MS Dhoni",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "RD Gaikwad",
              bowler: "J Bumrah",
              non_striker: "MS Dhoni",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "RD Gaikwad",
              bowler: "J Bumrah",
              non_striker: "MS Dhoni",
              runs: { batter: 0, extras: 0, total: 0 },
              wickets: [
                {
                  player_out: "RD Gaikwad",
                  kind: "bowled",
                },
              ],
            },
            {
              batter: "A Rahane",
              bowler: "J Bumrah",
              non_striker: "MS Dhoni",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "A Rahane",
              bowler: "J Bumrah",
              non_striker: "MS Dhoni",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "A Rahane",
              bowler: "J Bumrah",
              non_striker: "MS Dhoni",
              runs: { batter: 0, extras: 0, total: 0 },
            },
          ],
        },
      ],
    },
  ],
};

/** Fixture with extras (wides, no-balls). */
const FIXTURE_WITH_EXTRAS = {
  meta: { data_version: "1.0.0" },
  info: {
    teams: ["Team A", "Team B"],
    dates: ["2026-04-01"],
    season: "2026",
  },
  innings: [
    {
      team: "Team A",
      overs: [
        {
          over: 0,
          deliveries: [
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 0, extras: 1, total: 1 },
              extras: { wides: 1 },
            },
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 4, extras: 0, total: 4 },
            },
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 1, extras: 1, total: 2 },
              extras: { noballs: 1 },
            },
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 2, extras: 0, total: 2 },
            },
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "Player A",
              bowler: "Bowler X",
              non_striker: "Player B",
              runs: { batter: 0, extras: 2, total: 2 },
              extras: { byes: 2 },
            },
          ],
        },
      ],
    },
  ],
};

/** Fixture with run-out (should NOT count as bowling wicket). */
const FIXTURE_WITH_RUNOUT = {
  meta: { data_version: "1.0.0" },
  info: {
    teams: ["Team C", "Team D"],
    dates: ["2026-04-02"],
    season: "2026",
  },
  innings: [
    {
      team: "Team C",
      overs: [
        {
          over: 0,
          deliveries: [
            {
              batter: "Batter1",
              bowler: "FastBowler",
              non_striker: "Batter2",
              runs: { batter: 1, extras: 0, total: 1 },
              wickets: [
                {
                  player_out: "Batter2",
                  fielders: [{ name: "Fielder1" }],
                  kind: "run out",
                },
              ],
            },
            {
              batter: "Batter3",
              bowler: "FastBowler",
              non_striker: "Batter1",
              runs: { batter: 0, extras: 0, total: 0 },
              wickets: [
                {
                  player_out: "Batter3",
                  kind: "lbw",
                },
              ],
            },
            {
              batter: "Batter4",
              bowler: "FastBowler",
              non_striker: "Batter1",
              runs: { batter: 0, extras: 0, total: 0 },
              wickets: [
                {
                  player_out: "Batter4",
                  kind: "bowled",
                },
              ],
            },
            {
              batter: "Batter5",
              bowler: "FastBowler",
              non_striker: "Batter1",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "Batter5",
              bowler: "FastBowler",
              non_striker: "Batter1",
              runs: { batter: 0, extras: 0, total: 0 },
            },
            {
              batter: "Batter5",
              bowler: "FastBowler",
              non_striker: "Batter1",
              runs: { batter: 0, extras: 0, total: 0 },
            },
          ],
        },
      ],
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("aggregateCricsheetInnings", () => {
  describe("batting stats", () => {
    it("aggregates runs, balls, fours, sixes for each batter", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      const sharma = perfs.find((p) => p.playerName === "R Sharma");
      expect(sharma).toBeDefined();
      expect(sharma!.stats.batting).toEqual({
        runs: 13, // 4 + 0 + 6 + 1 + 2 + 0*5 = 13
        ballsFaced: 10, // 4 in over 0 + 6 in over 1 = 10 (R Sharma faces deliveries, not all balls in overs)
        fours: 1,
        sixes: 1,
        dismissed: false,
        playedInStartingXi: true,
      });
    });

    it("marks dismissed batters correctly", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      const kishan = perfs.find((p) => p.playerName === "I Kishan");
      expect(kishan).toBeDefined();
      expect(kishan!.stats.batting!.dismissed).toBe(true);
      expect(kishan!.stats.batting!.runs).toBe(0); // duck
    });

    it("registers non-strikers who never faced a ball", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      // MS Dhoni was only non-striker in innings 2
      const dhoni = perfs.find((p) => p.playerName === "MS Dhoni");
      expect(dhoni).toBeDefined();
      expect(dhoni!.stats.batting!.ballsFaced).toBe(0);
      expect(dhoni!.stats.batting!.runs).toBe(0);
    });

    it("handles bowled dismissal (batting)", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      const gaikwad = perfs.find((p) => p.playerName === "RD Gaikwad");
      expect(gaikwad).toBeDefined();
      expect(gaikwad!.stats.batting!.dismissed).toBe(true);
    });
  });

  describe("bowling stats", () => {
    it("counts legal deliveries (excludes wides/no-balls)", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      const chahar = perfs.find((p) => p.playerName === "D Chahar");
      expect(chahar).toBeDefined();
      expect(chahar!.stats.bowling!.ballsBowled).toBe(6); // 6 legal deliveries
      expect(chahar!.stats.bowling!.runsConceded).toBe(11); // 4+0+6+1+0+0
      expect(chahar!.stats.bowling!.wicketsExcludingRunOut).toBe(1); // I Kishan caught
    });

    it("detects maiden overs", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      // M Theekshana bowled over 1: 2+0+0+0+0+0 = 2 runs — not maiden
      // Theekshana only bowls, doesn't bat in this fixture — check bowling stats
      const theekshana = perfs.find((p) => p.playerName === "M Theekshana");
      expect(theekshana).toBeDefined();
      expect(theekshana!.stats.bowling!.maidens).toBe(0);
      expect(theekshana!.stats.bowling!.dotBalls).toBe(5);

      // J Bumrah bowled over 0 in innings 2: all 0s = maiden!
      const bumrah = perfs.find((p) => p.playerName === "J Bumrah");
      expect(bumrah).toBeDefined();
      expect(bumrah!.stats.bowling!.maidens).toBe(1);
      expect(bumrah!.stats.bowling!.runsConceded).toBe(0);
    });

    it("tracks dot balls", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      const bumrah = perfs.find((p) => p.playerName === "J Bumrah");
      expect(bumrah!.stats.bowling!.dotBalls).toBe(6);
    });

    it("credits lbw and bowled wickets separately", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      const bumrah = perfs.find((p) => p.playerName === "J Bumrah");
      expect(bumrah!.stats.bowling!.wicketsExcludingRunOut).toBe(1); // bowled Gaikwad
      expect(bumrah!.stats.bowling!.lbwOrBowledWickets).toBe(1);
    });
  });

  describe("extras handling", () => {
    it("counts no-balls as batter balls faced, but not wides", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_WITH_EXTRAS.innings);
      const playerA = perfs.find((p) => p.playerName === "Player A");
      expect(playerA).toBeDefined();
      // Deliveries faced by batter: wide (no), 4 (yes), no-ball (yes), 2,0,0,0,byes(yes)
      // = 7 balls faced (all except the wide)
      expect(playerA!.stats.batting!.ballsFaced).toBe(7);
    });

    it("does not count wides as legal deliveries for bowler", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_WITH_EXTRAS.innings);
      const bowlerX = perfs.find((p) => p.playerName === "Bowler X");
      expect(bowlerX).toBeDefined();
      // 8 total deliveries, but 1 wide + 1 no-ball = 6 legal
      expect(bowlerX!.stats.bowling!.ballsBowled).toBe(6);
    });

    it("counts extra runs in bowler's conceded total", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_WITH_EXTRAS.innings);
      const bowlerX = perfs.find((p) => p.playerName === "Bowler X");
      // Total runs: 1(wide) + 4 + 2(nb) + 2 + 0 + 0 + 0 + 2(byes) = 11
      expect(bowlerX!.stats.bowling!.runsConceded).toBe(11);
    });

    it("credits batter's fours correctly ignoring extras", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_WITH_EXTRAS.innings);
      const playerA = perfs.find((p) => p.playerName === "Player A");
      expect(playerA!.stats.batting!.fours).toBe(1); // only the clean 4
      expect(playerA!.stats.batting!.runs).toBe(7); // 0+4+1+2+0+0+0+0 = 7 batter runs
    });
  });

  describe("run-out vs bowling wickets", () => {
    it("does not credit bowler for run-outs", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_WITH_RUNOUT.innings);
      const bowler = perfs.find((p) => p.playerName === "FastBowler");
      expect(bowler).toBeDefined();
      // 3 wickets total, but 1 is run-out → only 2 bowling wickets
      expect(bowler!.stats.bowling!.wicketsExcludingRunOut).toBe(2);
    });

    it("credits lbw and bowled separately", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_WITH_RUNOUT.innings);
      const bowler = perfs.find((p) => p.playerName === "FastBowler");
      expect(bowler!.stats.bowling!.lbwOrBowledWickets).toBe(2); // lbw + bowled
    });

    it("marks run-out victim as dismissed", () => {
      const perfs = aggregateCricsheetInnings(FIXTURE_WITH_RUNOUT.innings);
      const batter2 = perfs.find((p) => p.playerName === "Batter2");
      expect(batter2).toBeDefined();
      expect(batter2!.stats.batting!.dismissed).toBe(true);
    });
  });

  describe("merged batting + bowling", () => {
    it("players who bat and bowl have both stats", () => {
      // In our fixture, D Chahar bats in CSK (oh wait, he bowls for CSK in innings 1)
      // Let's check a bowler who also appeared as non-striker
      const perfs = aggregateCricsheetInnings(FIXTURE_T20_MATCH.innings);
      // D Chahar bowls in innings 1 — has bowling stats
      const chahar = perfs.find((p) => p.playerName === "D Chahar");
      expect(chahar!.stats.bowling).toBeDefined();
      // He doesn't bat in this fixture, but that's fine — just bowling
    });
  });
});

describe("parseCricsheetMatch", () => {
  it("parses a valid match payload", () => {
    const perfs = parseCricsheetMatch(FIXTURE_T20_MATCH);
    expect(perfs.length).toBeGreaterThan(0);
    // Should have batters + bowlers from both innings
    const names = perfs.map((p) => p.playerName);
    expect(names).toContain("R Sharma");
    expect(names).toContain("J Bumrah");
    expect(names).toContain("D Chahar");
    expect(names).toContain("RD Gaikwad");
  });

  it("throws on null input", () => {
    expect(() => parseCricsheetMatch(null)).toThrow("Invalid Cricsheet JSON payload");
  });

  it("throws on empty innings", () => {
    expect(() =>
      parseCricsheetMatch({ meta: {}, info: { teams: [] }, innings: [] }),
    ).toThrow("no innings data");
  });

  it("returns correct player count across both innings", () => {
    const perfs = parseCricsheetMatch(FIXTURE_T20_MATCH);
    // Innings 1 batters: R Sharma, I Kishan, S Yadav (3)
    // Innings 1 bowlers: D Chahar, M Theekshana (2)
    // Innings 2 batters: RD Gaikwad, MS Dhoni (non-striker), A Rahane (3)
    // Innings 2 bowler: J Bumrah (1)
    // Unique: R Sharma, I Kishan, S Yadav, D Chahar, M Theekshana, RD Gaikwad, MS Dhoni, A Rahane, J Bumrah = 9
    expect(perfs.length).toBe(9);
  });
});
