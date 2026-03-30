import { describe, expect, it } from "vitest";
import { extractPerformancesFromCricApiJson } from "./fetch-scorecard";

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

