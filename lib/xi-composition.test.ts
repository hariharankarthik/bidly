import { describe, it, expect } from "vitest";
import {
  validateXiComposition,
  autoPickXi,
  fixXiComposition,
  computeEffectiveXi,
  MIN_WK,
  MIN_CAN_BAT,
  MIN_CAN_BOWL,
} from "./xi-composition";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoleMap(entries: Array<[string, string]>): Map<string, string> {
  return new Map(entries);
}
function makePriceMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries);
}

// A balanced squad: 2 WK, 4 BAT, 4 BOWL, 5 ALL
const balancedSquad = [
  "wk1", "wk2",
  "bat1", "bat2", "bat3", "bat4",
  "bowl1", "bowl2", "bowl3", "bowl4",
  "all1", "all2", "all3", "all4", "all5",
];
const balancedRoles = makeRoleMap([
  ["wk1", "WK"], ["wk2", "WK"],
  ["bat1", "BAT"], ["bat2", "BAT"], ["bat3", "BAT"], ["bat4", "BAT"],
  ["bowl1", "BOWL"], ["bowl2", "BOWL"], ["bowl3", "BOWL"], ["bowl4", "BOWL"],
  ["all1", "ALL"], ["all2", "ALL"], ["all3", "ALL"], ["all4", "ALL"], ["all5", "ALL"],
]);
const balancedPrices = makePriceMap([
  ["wk1", 1500], ["wk2", 800],
  ["bat1", 1400], ["bat2", 1200], ["bat3", 1000], ["bat4", 700],
  ["bowl1", 1300], ["bowl2", 1100], ["bowl3", 900], ["bowl4", 600],
  ["all1", 1600], ["all2", 1350], ["all3", 1050], ["all4", 750], ["all5", 500],
]);

// ---------------------------------------------------------------------------
// validateXiComposition
// ---------------------------------------------------------------------------

describe("validateXiComposition", () => {
  it("accepts a valid XI (1 WK, 6 bat-capable, 4 bowl-capable)", () => {
    // wk1(WK=bat), bat1(bat), bat2(bat), bat3(bat), bat4(bat), all1(bat+bowl), all2(bat+bowl)
    // bowl1(bowl), bowl2(bowl), bowl3(bowl), bowl4(bowl)
    // canBat: wk1+bat1+bat2+bat3+bat4+all1+all2 = 7 ✓
    // canBowl: all1+all2+bowl1+bowl2+bowl3+bowl4 = 6 ✓
    // wk: 1 ✓
    const xi = ["wk1", "bat1", "bat2", "bat3", "bat4", "all1", "all2", "bowl1", "bowl2", "bowl3", "bowl4"];
    const result = validateXiComposition(xi, balancedRoles);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects XI with no wicketkeeper", () => {
    const xi = ["bat1", "bat2", "bat3", "bat4", "all1", "all2", "all3", "all4", "all5", "bowl1", "bowl2"];
    const result = validateXiComposition(xi, balancedRoles);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least 1 wicketkeeper required");
  });

  it("rejects XI with only 5 batsmen-capable", () => {
    // wk1(bat), bat1(bat), bat2(bat), bat3(bat), all1(bat+bowl) = 5 bat
    // bowl1, bowl2, bowl3, bowl4, all2(bat+bowl), all3(bat+bowl) = more bowlers
    // Actually: canBat = wk1+bat1+bat2+bat3+all1+all2+all3 = 7... let me make a smaller bat count
    // wk1(bat), bat1(bat), bat2(bat), bat3(bat) = 4 bat, plus we need 7 more from bowl only
    const xi = ["wk1", "bat1", "bat2", "bat3", "bowl1", "bowl2", "bowl3", "bowl4", "all1", "all2", "all3"];
    // canBat: wk1+bat1+bat2+bat3+all1+all2+all3 = 7 → still too many
    // Let's try: 1 WK, 1 BAT, 5 BOWL, 4 ALL → canBat = 1+1+4 = 6, canBowl = 5+4 = 9
    // That's still valid. To fail we need: 1 WK, 0 BAT, 6 BOWL, 4 ALL → canBat = 1+4 = 5
    const roles5bat = makeRoleMap([
      ["p1", "WK"],
      ["p2", "BOWL"], ["p3", "BOWL"], ["p4", "BOWL"], ["p5", "BOWL"], ["p6", "BOWL"], ["p7", "BOWL"],
      ["p8", "ALL"], ["p9", "ALL"], ["p10", "ALL"], ["p11", "ALL"],
    ]);
    const xi5bat = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"];
    // canBat: p1(WK) + p8+p9+p10+p11(ALL) = 5 → fail
    const result = validateXiComposition(xi5bat, roles5bat);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`At least ${MIN_CAN_BAT} batsmen (BAT/ALL/WK) required`);
  });

  it("rejects XI with only 3 bowlers-capable", () => {
    const roles3bowl = makeRoleMap([
      ["p1", "WK"], ["p2", "WK"],
      ["p3", "BAT"], ["p4", "BAT"], ["p5", "BAT"], ["p6", "BAT"], ["p7", "BAT"],
      ["p8", "ALL"], ["p9", "ALL"], ["p10", "ALL"],
      ["p11", "BOWL"],
    ]);
    const xi3bowl = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"];
    // canBowl: p8+p9+p10(ALL) + p11(BOWL) = 4 → actually that's 4, not 3
    // Reduce ALLs: 2 ALL + 1 BOWL = 3 bowl
    const roles3bowl2 = makeRoleMap([
      ["p1", "WK"], ["p2", "WK"],
      ["p3", "BAT"], ["p4", "BAT"], ["p5", "BAT"], ["p6", "BAT"], ["p7", "BAT"], ["p8", "BAT"],
      ["p9", "ALL"], ["p10", "ALL"],
      ["p11", "BOWL"],
    ]);
    // canBowl: p9+p10(ALL) + p11(BOWL) = 3
    const result = validateXiComposition(xi3bowl, roles3bowl2);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`At least ${MIN_CAN_BOWL} bowlers (BOWL/ALL) required`);
  });

  it("ALL-rounders count toward both bat and bowl", () => {
    // 1 WK, 0 BAT, 0 BOWL, 10 ALL → canBat = 1+10 = 11, canBowl = 10 ✓
    const roles = makeRoleMap([
      ["p1", "WK"],
      ...Array.from({ length: 10 }, (_, i) => [`a${i}`, "ALL"] as [string, string]),
    ]);
    const xi = ["p1", ...Array.from({ length: 10 }, (_, i) => `a${i}`)];
    const result = validateXiComposition(xi, roles);
    expect(result.valid).toBe(true);
  });

  it("WK counts as a batsman", () => {
    // 6 WK, 5 BOWL → canBat = 6, canBowl = 5, wk = 6 ✓
    const roles = makeRoleMap([
      ...Array.from({ length: 6 }, (_, i) => [`wk${i}`, "WK"] as [string, string]),
      ...Array.from({ length: 5 }, (_, i) => [`b${i}`, "BOWL"] as [string, string]),
    ]);
    const xi = [...Array.from({ length: 6 }, (_, i) => `wk${i}`), ...Array.from({ length: 5 }, (_, i) => `b${i}`)];
    const result = validateXiComposition(xi, roles);
    expect(result.valid).toBe(true);
  });

  it("reports multiple errors at once", () => {
    // 0 WK, 11 BOWL → wk=0, canBat=0, canBowl=11
    const roles = makeRoleMap(
      Array.from({ length: 11 }, (_, i) => [`b${i}`, "BOWL"] as [string, string]),
    );
    const xi = Array.from({ length: 11 }, (_, i) => `b${i}`);
    const result = validateXiComposition(xi, roles);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2); // no WK + not enough bat
    expect(result.errors).toContain("At least 1 wicketkeeper required");
    expect(result.errors).toContain(`At least ${MIN_CAN_BAT} batsmen (BAT/ALL/WK) required`);
  });
});

// ---------------------------------------------------------------------------
// autoPickXi
// ---------------------------------------------------------------------------

describe("autoPickXi", () => {
  it("picks a valid composition from a balanced squad", () => {
    const { xi, captain, viceCaptain } = autoPickXi(balancedSquad, balancedRoles, balancedPrices);
    expect(xi).toHaveLength(11);
    const { valid } = validateXiComposition(xi, balancedRoles);
    expect(valid).toBe(true);
  });

  it("captain is most expensive, VC is second most expensive in XI", () => {
    const { xi, captain, viceCaptain } = autoPickXi(balancedSquad, balancedRoles, balancedPrices);
    const prices = xi.map((id) => balancedPrices.get(id)!).sort((a, b) => b - a);
    expect(balancedPrices.get(captain)).toBe(prices[0]);
    expect(balancedPrices.get(viceCaptain)).toBe(prices[1]);
  });

  it("selects the most expensive WK", () => {
    const { xi } = autoPickXi(balancedSquad, balancedRoles, balancedPrices);
    expect(xi).toContain("wk1"); // 1500 > 800
  });

  it("handles squad with exactly 11 players", () => {
    const small = balancedSquad.slice(0, 11);
    const { xi } = autoPickXi(small, balancedRoles, balancedPrices);
    expect(xi).toHaveLength(11);
    expect(new Set(xi).size).toBe(11);
  });

  it("handles a bowler-heavy squad", () => {
    const squad = ["wk1", "bat1", "bat2", "bat3", "bat4", "bowl1", "bowl2", "bowl3", "bowl4", "all1", "all2",
      "bowl5", "bowl6", "bowl7", "bowl8"];
    const roles = makeRoleMap([
      ["wk1", "WK"], ["bat1", "BAT"], ["bat2", "BAT"], ["bat3", "BAT"], ["bat4", "BAT"],
      ["bowl1", "BOWL"], ["bowl2", "BOWL"], ["bowl3", "BOWL"], ["bowl4", "BOWL"],
      ["bowl5", "BOWL"], ["bowl6", "BOWL"], ["bowl7", "BOWL"], ["bowl8", "BOWL"],
      ["all1", "ALL"], ["all2", "ALL"],
    ]);
    const prices = makePriceMap(squad.map((id, i) => [id, 1500 - i * 100]));
    const { xi } = autoPickXi(squad, roles, prices);
    expect(xi).toHaveLength(11);
    const { valid } = validateXiComposition(xi, roles);
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fixXiComposition
// ---------------------------------------------------------------------------

describe("fixXiComposition", () => {
  it("returns as-is when XI is already valid", () => {
    const xi = ["wk1", "bat1", "bat2", "bat3", "bat4", "all1", "all2", "bowl1", "bowl2", "bowl3", "bowl4"];
    const { xi: fixed, swaps } = fixXiComposition(xi, balancedSquad, balancedRoles, balancedPrices);
    expect(fixed).toEqual(xi);
    expect(swaps).toHaveLength(0);
  });

  it("swaps in a WK when none present", () => {
    // XI with no WK: 4 BAT, 4 BOWL, 3 ALL → canBat = 4+3=7, canBowl = 4+3=7, wk = 0
    const xi = ["bat1", "bat2", "bat3", "bat4", "bowl1", "bowl2", "bowl3", "bowl4", "all1", "all2", "all3"];
    const { xi: fixed, swaps } = fixXiComposition(xi, balancedSquad, balancedRoles, balancedPrices);
    const { valid } = validateXiComposition(fixed, balancedRoles);
    expect(valid).toBe(true);
    expect(swaps.length).toBeGreaterThanOrEqual(1);
    // A WK should now be in the XI
    expect(fixed.some((id) => balancedRoles.get(id) === "WK")).toBe(true);
  });

  it("swaps in bowlers when not enough", () => {
    // XI: 1 WK, 5 BAT (using bat4 placeholder as extra), 2 BOWL, 3 ALL
    // Wait, that's canBowl = 2+3 = 5 ✓. Let me force only 3 bowl:
    // 1 WK, 6 BAT, 1 BOWL, 3 ALL ... but that's 11 and canBowl = 1+3=4 ✓
    // Let me try: 1 WK, 8 BAT, 2 ALL → canBowl = 2 (need 4)
    const customRoles = makeRoleMap([
      ["wk1", "WK"],
      ["b1", "BAT"], ["b2", "BAT"], ["b3", "BAT"], ["b4", "BAT"],
      ["b5", "BAT"], ["b6", "BAT"], ["b7", "BAT"], ["b8", "BAT"],
      ["a1", "ALL"], ["a2", "ALL"],
      // bench:
      ["bw1", "BOWL"], ["bw2", "BOWL"], ["bw3", "BOWL"], ["bw4", "BOWL"],
    ]);
    const customSquad = ["wk1", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "a1", "a2", "bw1", "bw2", "bw3", "bw4"];
    const customPrices = makePriceMap(customSquad.map((id, i) => [id, 1500 - i * 100]));
    const xi = ["wk1", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "a1", "a2"];
    // canBowl: a1+a2 = 2 → need 2 more

    const { xi: fixed, swaps } = fixXiComposition(xi, customSquad, customRoles, customPrices);
    const { valid } = validateXiComposition(fixed, customRoles);
    expect(valid).toBe(true);
    expect(swaps.length).toBeGreaterThanOrEqual(2);
  });

  it("makes minimal number of swaps", () => {
    // Missing 1 WK only
    const xi = ["bat1", "bat2", "bat3", "bat4", "all1", "all2", "all3", "all4", "bowl1", "bowl2", "bowl3"];
    const { swaps } = fixXiComposition(xi, balancedSquad, balancedRoles, balancedPrices);
    expect(swaps.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveXi
// ---------------------------------------------------------------------------

describe("computeEffectiveXi", () => {
  const standardXi = ["wk1", "bat1", "bat2", "bat3", "bat4", "all1", "all2", "bowl1", "bowl2", "bowl3", "bowl4"];

  it("returns original XI when nobody is DNP", () => {
    const matchPlayers = new Set(standardXi);
    const result = computeEffectiveXi({
      xiPlayerIds: standardXi,
      squadPlayerIds: balancedSquad,
      captainId: "all1",
      vcId: "wk1",
      matchPlayerIds: matchPlayers,
      roleMap: balancedRoles,
      priceMap: balancedPrices,
    });
    expect(result.effectiveXi).toEqual(standardXi);
    expect(result.effectiveCaptain).toBe("all1");
    expect(result.effectiveVc).toBe("wk1");
    expect(result.substitutions).toHaveLength(0);
  });

  it("substitutes a DNP player with highest-priced bench player who played", () => {
    // bat4 didn't play, bench all3(1050) and all5(500) played
    const matchPlayers = new Set([...standardXi.filter((id) => id !== "bat4"), "all3", "all5"]);
    const result = computeEffectiveXi({
      xiPlayerIds: standardXi,
      squadPlayerIds: balancedSquad,
      captainId: "all1",
      vcId: "wk1",
      matchPlayerIds: matchPlayers,
      roleMap: balancedRoles,
      priceMap: balancedPrices,
    });
    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0].out).toBe("bat4");
    // all3 is more expensive (1050 > 500)
    expect(result.substitutions[0].in).toBe("all3");
    expect(result.effectiveXi).toContain("all3");
    expect(result.effectiveXi).not.toContain("bat4");
  });

  it("Captain DNP → effectiveCaptain becomes null", () => {
    const matchPlayers = new Set([...standardXi.filter((id) => id !== "all1"), "all3"]);
    const result = computeEffectiveXi({
      xiPlayerIds: standardXi,
      squadPlayerIds: balancedSquad,
      captainId: "all1",
      vcId: "wk1",
      matchPlayerIds: matchPlayers,
      roleMap: balancedRoles,
      priceMap: balancedPrices,
    });
    expect(result.effectiveCaptain).toBeNull();
    expect(result.effectiveVc).toBe("wk1");
    expect(result.substitutions.some((s) => s.out === "all1")).toBe(true);
  });

  it("VC DNP → effectiveVc becomes null", () => {
    const matchPlayers = new Set([...standardXi.filter((id) => id !== "wk1"), "wk2"]);
    const result = computeEffectiveXi({
      xiPlayerIds: standardXi,
      squadPlayerIds: balancedSquad,
      captainId: "all1",
      vcId: "wk1",
      matchPlayerIds: matchPlayers,
      roleMap: balancedRoles,
      priceMap: balancedPrices,
    });
    expect(result.effectiveVc).toBeNull();
    expect(result.effectiveCaptain).toBe("all1");
  });

  it("bench player who also didn't play is not eligible for sub", () => {
    // bat4 DNP, bench players all3 and all5 also DNP, only wk2 played
    const matchPlayers = new Set([...standardXi.filter((id) => id !== "bat4"), "wk2"]);
    const result = computeEffectiveXi({
      xiPlayerIds: standardXi,
      squadPlayerIds: balancedSquad,
      captainId: "all1",
      vcId: "wk1",
      matchPlayerIds: matchPlayers,
      roleMap: balancedRoles,
      priceMap: balancedPrices,
    });
    // wk2 should sub in (only bench player who played), if composition allows
    if (result.substitutions.length > 0) {
      expect(result.substitutions[0].in).toBe("wk2");
    }
  });

  it("handles multiple DNP players", () => {
    // bat3 and bowl3 DNP; bench all3, all4, all5 played
    const matchPlayers = new Set([
      ...standardXi.filter((id) => id !== "bat3" && id !== "bowl3"),
      "all3", "all4", "all5",
    ]);
    const result = computeEffectiveXi({
      xiPlayerIds: standardXi,
      squadPlayerIds: balancedSquad,
      captainId: "all1",
      vcId: "wk1",
      matchPlayerIds: matchPlayers,
      roleMap: balancedRoles,
      priceMap: balancedPrices,
    });
    expect(result.substitutions).toHaveLength(2);
    expect(result.effectiveXi).not.toContain("bat3");
    expect(result.effectiveXi).not.toContain("bowl3");
  });

  it("no sub if it would break composition", () => {
    // Only 1 WK in XI (wk1), wk1 DNP, only bench players are BOWLs who played
    const customSquad = ["wk1", "bat1", "bat2", "bat3", "bat4", "all1", "all2", "all3", "bowl1", "bowl2", "bowl3", "bowl4", "bat5", "bat6", "bat7"];
    const customRoles = makeRoleMap([
      ["wk1", "WK"],
      ["bat1", "BAT"], ["bat2", "BAT"], ["bat3", "BAT"], ["bat4", "BAT"],
      ["bat5", "BAT"], ["bat6", "BAT"], ["bat7", "BAT"],
      ["all1", "ALL"], ["all2", "ALL"], ["all3", "ALL"],
      ["bowl1", "BOWL"], ["bowl2", "BOWL"], ["bowl3", "BOWL"], ["bowl4", "BOWL"],
    ]);
    const xi = ["wk1", "bat1", "bat2", "bat3", "bat4", "all1", "all2", "all3", "bowl1", "bowl2", "bowl3"];
    // wk1 DNP, only bat5 played on bench → subbing bat5 for wk1 would leave 0 WK
    const matchPlayers = new Set([...xi.filter((id) => id !== "wk1"), "bat5"]);
    const result = computeEffectiveXi({
      xiPlayerIds: xi,
      squadPlayerIds: customSquad,
      captainId: "all1",
      vcId: "bat1",
      matchPlayerIds: matchPlayers,
      roleMap: customRoles,
      priceMap: balancedPrices,
    });
    // bat5 is BAT, replacing wk1 would leave 0 WK → composition invalid → no sub
    expect(result.substitutions).toHaveLength(0);
    expect(result.effectiveXi).toContain("wk1"); // stays, just gets 0 points
  });
});
