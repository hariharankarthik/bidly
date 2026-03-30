import { describe, expect, it } from "vitest";
import { scoreBatting, scoreBowling, scorePlayerMatch } from "./auctionroom-ipl";

describe("scoreBatting", () => {
  it("awards only highest batting milestone for a century", () => {
    const r = scoreBatting({
      runs: 102,
      ballsFaced: 60,
      fours: 8,
      sixes: 2,
      dismissed: false,
      playedInStartingXi: true,
    });
    expect(r.breakdown.batting_milestone).toBe(16);
    expect(r.breakdown.batting_milestone).not.toBe(8);
    expect(r.breakdown.playing_xi).toBe(4);
    expect(r.breakdown.runs).toBe(102);
    expect(r.breakdown.fours_bonus).toBe(32);
    expect(r.breakdown.sixes_bonus).toBe(12);
  });

  it("applies duck penalty when dismissed for 0", () => {
    const r = scoreBatting({
      runs: 0,
      ballsFaced: 3,
      fours: 0,
      sixes: 0,
      dismissed: true,
    });
    expect(r.breakdown.duck).toBe(-2);
  });

  it("does not apply strike rate when below eligibility", () => {
    const r = scoreBatting({
      runs: 18,
      ballsFaced: 9,
      fours: 2,
      sixes: 0,
      dismissed: false,
    });
    expect(r.breakdown.strike_rate).toBeUndefined();
  });
});

describe("scoreBowling", () => {
  it("applies highest wicket milestone only", () => {
    const r = scoreBowling({
      ballsBowled: 24,
      runsConceded: 20,
      wicketsExcludingRunOut: 5,
      lbwOrBowledWickets: 2,
      maidens: 1,
      dotBalls: 12,
    });
    expect(r.breakdown.wicket_milestone).toBe(16);
    expect(r.breakdown.wickets).toBe(150);
    expect(r.breakdown.lbw_bowled_bonus).toBe(16);
  });
});

describe("scorePlayerMatch", () => {
  it("sums batting + fielding", () => {
    const r = scorePlayerMatch({
      batting: { runs: 50, ballsFaced: 40, fours: 4, sixes: 1, dismissed: false, playedInStartingXi: true },
      fielding: { catches: 1 },
    });
    expect(r.total).toBeGreaterThan(0);
    expect(r.breakdown.bat_batting_milestone).toBe(8);
    expect(r.breakdown.field_catches).toBe(8);
  });
});
