import { describe, expect, it } from "vitest";
import { matchDbPlayerForCricApiName, mapCricApiExtractedToPerformances } from "@/lib/cricapi/map-player-names";

describe("matchDbPlayerForCricApiName", () => {
  const pool = [{ id: "1", name: "Virat Kohli" }, { id: "2", name: "Ruturaj Gaikwad" }];

  it("maps short initial + last name to full name", () => {
    expect(matchDbPlayerForCricApiName(pool, "V Kohli")?.id).toBe("1");
  });

  it("maps exact name", () => {
    expect(matchDbPlayerForCricApiName(pool, "Virat Kohli")?.id).toBe("1");
  });

  it("returns null when last name + initial matches more than one player", () => {
    const twoSingh = [
      { id: "a", name: "Arshdeep Singh" },
      { id: "b", name: "Avesh Singh" },
    ];
    expect(matchDbPlayerForCricApiName(twoSingh, "A Singh")).toBeNull();
  });
});

describe("mapCricApiExtractedToPerformances", () => {
  it("produces unmatched list", () => {
    const { performances, unmatched } = mapCricApiExtractedToPerformances(
      [{ id: "1", name: "Virat Kohli" }],
      [{ playerName: "Nobody Known", stats: { batting: { runs: 1, ballsFaced: 1, fours: 0, sixes: 0, dismissed: false, playedInStartingXi: true } } } ],
    );
    expect(performances).toHaveLength(0);
    expect(unmatched).toEqual(["Nobody Known"]);
  });
});
