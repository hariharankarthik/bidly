import { describe, expect, it } from "vitest";
import { effectivePointsWithLineup } from "./lineup-multipliers";

describe("effectivePointsWithLineup", () => {
  it("applies captain 2× and VC 1.5× when in XI", () => {
    const xi = ["a", "b", "c"];
    expect(effectivePointsWithLineup(40, "a", { startingXiPlayerIds: xi, captainPlayerId: "a", viceCaptainPlayerId: "b" })).toEqual({
      effective: 80,
      counted: true,
      multiplier: 2,
    });
    expect(effectivePointsWithLineup(40, "b", { startingXiPlayerIds: xi, captainPlayerId: "a", viceCaptainPlayerId: "b" })).toEqual({
      effective: 60,
      counted: true,
      multiplier: 1.5,
    });
    expect(effectivePointsWithLineup(40, "c", { startingXiPlayerIds: xi, captainPlayerId: "a", viceCaptainPlayerId: "b" })).toEqual({
      effective: 40,
      counted: true,
      multiplier: 1,
    });
  });

  it("drops substitutes when XI is set", () => {
    expect(
      effectivePointsWithLineup(50, "bench", {
        startingXiPlayerIds: ["a"],
        captainPlayerId: "a",
        viceCaptainPlayerId: null,
      }),
    ).toEqual({ effective: 0, counted: false, multiplier: 0 });
  });

  it("counts full squad when XI empty", () => {
    expect(
      effectivePointsWithLineup(22, "p1", {
        startingXiPlayerIds: [],
        captainPlayerId: "p1",
        viceCaptainPlayerId: null,
      }),
    ).toEqual({ effective: 44, counted: true, multiplier: 2 });
  });
});
