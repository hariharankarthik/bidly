import { describe, expect, it } from "vitest";
import { detectDelimiter, parseDelimited } from "./parse-delimited";

describe("parseDelimited", () => {
  it("parses comma-separated rows", () => {
    expect(parseDelimited("a,b\n1,2", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted commas", () => {
    expect(parseDelimited('"a,b",c', ",")).toEqual([["a,b", "c"]]);
  });

  it("parses TSV", () => {
    expect(parseDelimited("name\trole\nFoo\tBAT", "\t")).toEqual([
      ["name", "role"],
      ["Foo", "BAT"],
    ]);
  });
});

describe("detectDelimiter", () => {
  it("prefers tab when present", () => {
    expect(detectDelimiter("team\tplayer\nA\tB")).toBe("\t");
  });
});
