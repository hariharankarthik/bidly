import { describe, expect, it } from "vitest";
import { isCricApiMatchUuid, parseCricApiMatchUuid } from "@/lib/cricapi/match-id";

describe("parseCricApiMatchUuid", () => {
  it("accepts standard UUIDs", () => {
    expect(parseCricApiMatchUuid(" 55fe0f15-6eb0-4ad5-835b-5564be4f6a21 ")).toBe(
      "55fe0f15-6eb0-4ad5-835b-5564be4f6a21",
    );
  });

  it("rejects non-UUID strings", () => {
    expect(() => parseCricApiMatchUuid("cric-1730000")).toThrow(/Invalid CricAPI match id/);
  });
});

describe("isCricApiMatchUuid", () => {
  it("returns false for random ids", () => {
    expect(isCricApiMatchUuid("not-a-uuid")).toBe(false);
  });
});
