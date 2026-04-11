import { describe, expect, it } from "vitest";
import { matchDbPlayerForCricApiName, mapCricApiExtractedToPerformances } from "@/lib/cricapi/map-player-names";

describe("matchDbPlayerForCricApiName", () => {
  const pool = [{ id: "1", name: "Virat Kohli" }, { id: "2", name: "Ruturaj Gaikwad" }];

  it("maps short initial + last name to full name", () => {
    expect(matchDbPlayerForCricApiName(pool, "V Kohli")?.player.id).toBe("1");
  });

  it("maps exact name", () => {
    expect(matchDbPlayerForCricApiName(pool, "Virat Kohli")?.player.id).toBe("1");
  });

  it("returns null when last name + initial matches more than one player", () => {
    const twoSingh = [
      { id: "a", name: "Arshdeep Singh" },
      { id: "b", name: "Avesh Singh" },
    ];
    expect(matchDbPlayerForCricApiName(twoSingh, "A Singh")).toBeNull();
  });

  it("matches via Levenshtein for spelling variations", () => {
    const players = [{ id: "1", name: "Vaibhav Suryavanshi" }];
    const result = matchDbPlayerForCricApiName(players, "Vaibhav Sooryavanshi");
    expect(result?.player.id).toBe("1");
    expect(result?.method).toBe("levenshtein");
  });

  it("matches via name_aliases", () => {
    const players = [{ id: "1", name: "Virat Kohli", name_aliases: ["V Kohli Jr", "King Kohli"] }];
    const result = matchDbPlayerForCricApiName(players, "King Kohli");
    expect(result?.player.id).toBe("1");
    expect(result?.method).toBe("alias");
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
