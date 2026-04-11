import { describe, expect, it } from "vitest";
import { assertCricApiScorecardPayload, extractPerformancesFromCricApiJson, parseFieldingCredits, mergeFieldingFromCricApiJson } from "./fetch-scorecard";

describe("assertCricApiScorecardPayload", () => {
  it("throws with reason when data is missing", () => {
    expect(() =>
      assertCricApiScorecardPayload({
        apikey: "x",
        status: "failure",
        reason: "Your limit is over.",
      }),
    ).toThrow("Your limit is over.");
  });

  it("throws failure status without reason", () => {
    expect(() => assertCricApiScorecardPayload({ status: "failure" })).toThrow("failure status");
  });

  it("throws when only reason is set (no data)", () => {
    expect(() => assertCricApiScorecardPayload({ reason: "Invalid id" })).toThrow("CricAPI: Invalid id");
  });

  it("allows success payload with data", () => {
    expect(() => assertCricApiScorecardPayload({ status: "success", data: { innings: [] } })).not.toThrow();
  });
});

describe("extractPerformancesFromCricApiJson", () => {
  it("extracts batting rows even when `batsman` key is missing", () => {
    const data = {
      data: {
        innings: [
          {
            scores: [
              [
                {
                  // CricAPI sometimes provides player name + stats without literal `batsman`
                  name: "V Kohli",
                  R: 50,
                  B: 30,
                  "4s": 4,
                  "6s": 1,
                },
              ],
            ],
          },
        ],
      },
    };

    const perf = extractPerformancesFromCricApiJson(data);
    expect(perf.length).toBe(1);
    expect(perf[0]!.playerName).toBe("V Kohli");
    expect(perf[0]!.stats.batting?.runs).toBe(50);
  });
});

describe("parseFieldingCredits", () => {
  it("parses caught: c FielderName b BowlerName", () => {
    const credits = parseFieldingCredits("c Kohli b Bumrah");
    expect(credits).toEqual([{ fielderName: "Kohli", type: "catch" }]);
  });

  it("parses caught and bowled: c & b BowlerName", () => {
    const credits = parseFieldingCredits("c & b Bumrah");
    expect(credits).toEqual([{ fielderName: "Bumrah", type: "catch" }]);
  });

  it("parses caught with keeper marker: c †Dhoni b Ashwin", () => {
    const credits = parseFieldingCredits("c †Dhoni b Ashwin");
    expect(credits).toEqual([{ fielderName: "Dhoni", type: "catch" }]);
  });

  it("parses stumped: st Dhoni b Ashwin", () => {
    const credits = parseFieldingCredits("st Dhoni b Ashwin");
    expect(credits).toEqual([{ fielderName: "Dhoni", type: "stumping" }]);
  });

  it("parses single run out: run out (Jadeja)", () => {
    const credits = parseFieldingCredits("run out (Jadeja)");
    expect(credits).toEqual([{ fielderName: "Jadeja", type: "runOutDirect" }]);
  });

  it("parses two-person run out: run out (Jadeja/Dhoni)", () => {
    const credits = parseFieldingCredits("run out (Jadeja/Dhoni)");
    expect(credits).toEqual([
      { fielderName: "Jadeja", type: "runOutThrower" },
      { fielderName: "Dhoni", type: "runOutDirect" },
    ]);
  });

  it("returns empty for bowled/lbw/hit wicket", () => {
    expect(parseFieldingCredits("b Bumrah")).toEqual([]);
    expect(parseFieldingCredits("lbw b Ashwin")).toEqual([]);
    expect(parseFieldingCredits("hit wicket b Ashwin")).toEqual([]);
  });

  it("returns empty for not out", () => {
    expect(parseFieldingCredits("not out")).toEqual([]);
  });
});

describe("mergeFieldingFromCricApiJson", () => {
  it("credits fielders from dismissal strings in CricAPI payload", () => {
    const performances = [
      { playerName: "Virat Kohli", stats: { batting: { runs: 50, ballsFaced: 30, fours: 4, sixes: 1, dismissed: false, playedInStartingXi: true } } },
      { playerName: "MS Dhoni", stats: { batting: { runs: 20, ballsFaced: 15, fours: 2, sixes: 0, dismissed: false, playedInStartingXi: true } } },
    ];
    const data = {
      data: {
        innings: [
          {
            scores: [[
              { batsman: "Player A", R: 10, B: 8, "4s": 1, "6s": 0, "dismissal-info": "c Kohli b Bumrah" },
              { batsman: "Player B", R: 5, B: 3, "4s": 0, "6s": 0, "dismissal-info": "st Dhoni b Ashwin" },
              { batsman: "Player C", R: 0, B: 1, "4s": 0, "6s": 0, "dismissal-info": "c Kohli b Jadeja" },
            ]],
          },
        ],
      },
    };

    const result = mergeFieldingFromCricApiJson(performances, data);
    const kohli = result.find((p) => p.playerName === "Virat Kohli");
    const dhoni = result.find((p) => p.playerName === "MS Dhoni");
    expect(kohli?.stats.fielding?.catches).toBe(2);
    expect(dhoni?.stats.fielding?.stumpings).toBe(1);
  });

  it("credits fielders from explicit catching[] array (CricAPI v1 format)", () => {
    const performances = [
      { playerName: "Dhruv Jurel", stats: { batting: { runs: 10, ballsFaced: 8, fours: 1, sixes: 0, dismissed: false, playedInStartingXi: true } } },
      { playerName: "Sanju Samson", stats: { batting: { runs: 30, ballsFaced: 20, fours: 3, sixes: 1, dismissed: false, playedInStartingXi: true } } },
    ];
    const data = {
      data: {
        scorecard: [
          {
            batting: [],
            bowling: [],
            catching: [
              { catcher: { id: "abc", name: "Dhruv Jurel" }, catch: 2, stumped: 1, runout: 0, cb: 0, lbw: 0, bowled: 0 },
              { catcher: { id: "def", name: "Sanju Samson" }, catch: 0, stumped: 0, runout: 1, cb: 0, lbw: 0, bowled: 0 },
            ],
            inning: "Test Inning",
          },
        ],
      },
    };

    const result = mergeFieldingFromCricApiJson(performances, data);
    const jurel = result.find((p) => p.playerName === "Dhruv Jurel");
    const samson = result.find((p) => p.playerName === "Sanju Samson");
    expect(jurel?.stats.fielding?.catches).toBe(2);
    expect(jurel?.stats.fielding?.stumpings).toBe(1);
    expect(samson?.stats.fielding?.runOutsDirect).toBe(1);
  });
});
