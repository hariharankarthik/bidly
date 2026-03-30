import { describe, expect, it } from "vitest";
import { nextBidAmount, validateBid } from "./auction-engine";
import { IPL_2026 } from "./sports/ipl";

describe("validateBid", () => {
  const team = { remaining_purse: 500, players_bought: 0, overseas_count: 0 };
  const player = { is_overseas: false, role: "BAT" };

  it("rejects bids not above current", () => {
    const r = validateBid(100, 100, team, player, IPL_2026);
    expect(r.valid).toBe(false);
  });

  it("rejects when purse cannot reserve min slots", () => {
    // IPL minPlayers 18, bidIncrements[0]=5 → after 16 bought, slotsAfterThis=1, minReserve=5.
    // 104 - 100 = 4 < 5 must fail.
    const t = { ...team, remaining_purse: 104, players_bought: 16 };
    const r = validateBid(100, 50, t, player, IPL_2026);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Insufficient purse/i);
  });

  it("accepts valid bid", () => {
    const r = validateBid(150, 100, team, player, IPL_2026);
    expect(r.valid).toBe(true);
  });
});

describe("nextBidAmount", () => {
  it("adds increment above floor", () => {
    expect(nextBidAmount(100, 20, 80)).toBe(120);
    expect(nextBidAmount(90, 20, 100)).toBe(120);
  });
});
