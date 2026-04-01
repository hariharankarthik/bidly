/**
 * Playing XI composition validation, role-aware auto-pick, minimal-swap fixer,
 * and auto-substitution for DNP (Did Not Play) players.
 *
 * Role counting rules (IPL):
 *   - Can bat  (min 6): BAT + ALL + WK
 *   - Can bowl (min 4): BOWL + ALL
 *   - Wicketkeeper (min 1): WK
 *   - ALL-rounders count toward both batting and bowling.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_WK = 1;
export const MIN_CAN_BAT = 6;
export const MIN_CAN_BOWL = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canBat(role: string): boolean {
  return role === "BAT" || role === "ALL" || role === "WK";
}

function canBowl(role: string): boolean {
  return role === "BOWL" || role === "ALL";
}

function isWk(role: string): boolean {
  return role === "WK";
}

function countRoles(playerIds: string[], roleMap: Map<string, string>) {
  let wk = 0;
  let bat = 0;
  let bowl = 0;
  for (const id of playerIds) {
    const role = roleMap.get(id) ?? "";
    if (isWk(role)) wk++;
    if (canBat(role)) bat++;
    if (canBowl(role)) bowl++;
  }
  return { wk, bat, bowl };
}

// ---------------------------------------------------------------------------
// validateXiComposition
// ---------------------------------------------------------------------------

export type CompositionResult = { valid: boolean; errors: string[] };

export function validateXiComposition(
  playerIds: string[],
  roleMap: Map<string, string>,
): CompositionResult {
  const { wk, bat, bowl } = countRoles(playerIds, roleMap);
  const errors: string[] = [];
  if (wk < MIN_WK) errors.push("At least 1 wicketkeeper required");
  if (bat < MIN_CAN_BAT) errors.push(`At least ${MIN_CAN_BAT} batsmen (BAT/ALL/WK) required`);
  if (bowl < MIN_CAN_BOWL) errors.push(`At least ${MIN_CAN_BOWL} bowlers (BOWL/ALL) required`);
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// autoPickXi — role-aware auto-pick by price
// ---------------------------------------------------------------------------

export function autoPickXi(
  squadPlayerIds: string[],
  roleMap: Map<string, string>,
  priceMap: Map<string, number>,
  xiSize = 11,
): { xi: string[]; captain: string; viceCaptain: string } {
  const byPrice = (a: string, b: string) => {
    const diff = (priceMap.get(b) ?? 0) - (priceMap.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  };

  // Group by role, each group sorted by price desc
  const wks = squadPlayerIds.filter((id) => roleMap.get(id) === "WK").sort(byPrice);
  const bats = squadPlayerIds.filter((id) => roleMap.get(id) === "BAT").sort(byPrice);
  const bowls = squadPlayerIds.filter((id) => roleMap.get(id) === "BOWL").sort(byPrice);
  const alls = squadPlayerIds.filter((id) => roleMap.get(id) === "ALL").sort(byPrice);

  const picked = new Set<string>();
  const pick = (id: string) => {
    picked.add(id);
  };

  // 1. Mandatory: 1 WK (most expensive)
  if (wks.length > 0) pick(wks[0]);

  // 2. Fill batting requirement: need MIN_CAN_BAT total can-bat in picked
  //    WK already counts as 1 can-bat, so we need MIN_CAN_BAT - wksInPicked more
  const batDeficit = () => MIN_CAN_BAT - countRoles([...picked], roleMap).bat;
  // Pick pure BATs first, then ALLs (ALLs are more flexible, save them)
  for (const id of bats) {
    if (picked.size >= xiSize) break;
    if (batDeficit() <= 0) break;
    pick(id);
  }
  // Still need more batsmen? Pick ALLs (they also count for bowling)
  for (const id of alls) {
    if (picked.size >= xiSize) break;
    if (batDeficit() <= 0) break;
    pick(id);
  }

  // 3. Fill bowling requirement
  const bowlDeficit = () => MIN_CAN_BOWL - countRoles([...picked], roleMap).bowl;
  for (const id of bowls) {
    if (picked.size >= xiSize) break;
    if (picked.has(id)) continue;
    if (bowlDeficit() <= 0) break;
    pick(id);
  }
  for (const id of alls) {
    if (picked.size >= xiSize) break;
    if (picked.has(id)) continue;
    if (bowlDeficit() <= 0) break;
    pick(id);
  }

  // 4. Fill remaining slots with the highest-priced remaining squad players
  const remaining = squadPlayerIds
    .filter((id) => !picked.has(id))
    .sort(byPrice);
  for (const id of remaining) {
    if (picked.size >= xiSize) break;
    pick(id);
  }

  const xi = [...picked].sort(byPrice);
  const captain = xi[0] ?? null;
  const viceCaptain = xi[1] ?? xi[0] ?? null;
  if (!captain || !viceCaptain) {
    // Squad too small to form a valid XI — return what we have
    return { xi, captain: xi[0] ?? "", viceCaptain: xi[1] ?? xi[0] ?? "" };
  }
  return { xi, captain, viceCaptain };
}

// ---------------------------------------------------------------------------
// fixXiComposition — minimal-swap fixer
// ---------------------------------------------------------------------------

export type SwapEntry = { out: string; in: string };

export function fixXiComposition(
  xiPlayerIds: string[],
  squadPlayerIds: string[],
  roleMap: Map<string, string>,
  priceMap: Map<string, number>,
): { xi: string[]; swaps: SwapEntry[] } {
  const currentXi = [...xiPlayerIds];
  const { valid } = validateXiComposition(currentXi, roleMap);
  if (valid) return { xi: currentXi, swaps: [] };

  const bench = squadPlayerIds.filter((id) => !currentXi.includes(id));
  const byPriceDesc = (a: string, b: string) => {
    const diff = (priceMap.get(b) ?? 0) - (priceMap.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  };
  const byPriceAsc = (a: string, b: string) => {
    const diff = (priceMap.get(a) ?? 0) - (priceMap.get(b) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  };

  const swaps: SwapEntry[] = [];
  const MAX_ITERATIONS = 20;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { wk, bat, bowl } = countRoles(currentXi, roleMap);
    if (wk >= MIN_WK && bat >= MIN_CAN_BAT && bowl >= MIN_CAN_BOWL) break;

    // Determine the most critical deficit
    let neededRole: "WK" | "BAT" | "BOWL" | null = null;
    if (wk < MIN_WK) neededRole = "WK";
    else if (bowl < MIN_CAN_BOWL) neededRole = "BOWL";
    else if (bat < MIN_CAN_BAT) neededRole = "BAT";

    if (!neededRole) break;

    // Find best bench candidate matching the needed capability
    const benchSorted = bench.slice().sort(byPriceDesc);
    let candidateIn: string | null = null;
    for (const id of benchSorted) {
      const role = roleMap.get(id) ?? "";
      if (neededRole === "WK" && isWk(role)) { candidateIn = id; break; }
      if (neededRole === "BOWL" && canBowl(role)) { candidateIn = id; break; }
      if (neededRole === "BAT" && canBat(role)) { candidateIn = id; break; }
    }
    if (!candidateIn) break; // No suitable bench player

    // Find the cheapest XI player whose swap improves the target deficit
    // without creating new deficits in dimensions that were already satisfied
    const xiSorted = currentXi.slice().sort(byPriceAsc);
    const before = { wk, bat, bowl };
    let candidateOut: string | null = null;
    for (const id of xiSorted) {
      const testXi = currentXi.filter((x) => x !== id);
      testXi.push(candidateIn);
      const after = countRoles(testXi, roleMap);

      // Must not break dimensions that were already satisfied
      if (before.wk >= MIN_WK && after.wk < MIN_WK) continue;
      if (before.bat >= MIN_CAN_BAT && after.bat < MIN_CAN_BAT) continue;
      if (before.bowl >= MIN_CAN_BOWL && after.bowl < MIN_CAN_BOWL) continue;

      // Must improve the target dimension
      if (neededRole === "WK" && after.wk <= before.wk) continue;
      if (neededRole === "BOWL" && after.bowl <= before.bowl) continue;
      if (neededRole === "BAT" && after.bat <= before.bat) continue;

      candidateOut = id;
      break;
    }

    if (!candidateOut) break; // No safe swap possible

    // Perform swap
    const outIdx = currentXi.indexOf(candidateOut);
    currentXi[outIdx] = candidateIn;
    bench.splice(bench.indexOf(candidateIn), 1);
    bench.push(candidateOut);
    swaps.push({ out: candidateOut, in: candidateIn });
  }

  return { xi: currentXi, swaps };
}

// ---------------------------------------------------------------------------
// computeEffectiveXi — auto-substitute DNP players at scoring time
// ---------------------------------------------------------------------------

export type SubstitutionEntry = { out: string; in: string };

export function computeEffectiveXi(opts: {
  xiPlayerIds: string[];
  squadPlayerIds: string[];
  captainId: string | null;
  vcId: string | null;
  matchPlayerIds: Set<string>;
  roleMap: Map<string, string>;
  priceMap: Map<string, number>;
}): {
  effectiveXi: string[];
  effectiveCaptain: string | null;
  effectiveVc: string | null;
  substitutions: SubstitutionEntry[];
} {
  const { xiPlayerIds, squadPlayerIds, captainId, vcId, matchPlayerIds, roleMap, priceMap } = opts;

  const effectiveXi = [...xiPlayerIds];
  let effectiveCaptain = captainId;
  let effectiveVc = vcId;
  const substitutions: SubstitutionEntry[] = [];

  // Find DNP players in XI
  const dnpIndices: number[] = [];
  for (let i = 0; i < effectiveXi.length; i++) {
    if (!matchPlayerIds.has(effectiveXi[i])) {
      dnpIndices.push(i);
    }
  }
  if (dnpIndices.length === 0) {
    return { effectiveXi, effectiveCaptain, effectiveVc, substitutions };
  }

  // Captain/VC lose multiplier if they didn't play
  if (effectiveCaptain && !matchPlayerIds.has(effectiveCaptain)) {
    effectiveCaptain = null;
  }
  if (effectiveVc && !matchPlayerIds.has(effectiveVc)) {
    effectiveVc = null;
  }

  // Available bench players who DID play, sorted by price desc
  const xiSet = new Set(effectiveXi);
  const benchWhoPlayed = squadPlayerIds
    .filter((id) => !xiSet.has(id) && matchPlayerIds.has(id))
    .sort((a, b) => {
      const diff = (priceMap.get(b) ?? 0) - (priceMap.get(a) ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

  const usedSubs = new Set<string>();

  for (const idx of dnpIndices) {
    const dnpPlayer = effectiveXi[idx];
    let bestSub: string | null = null;

    for (const candidate of benchWhoPlayed) {
      if (usedSubs.has(candidate)) continue;

      // Tentatively make the swap
      const testXi = effectiveXi.map((id, i) => (i === idx ? candidate : id));
      const { valid } = validateXiComposition(testXi, roleMap);
      if (valid) {
        // Prefer role-matching: if this candidate matches the DNP player's role, pick immediately
        const dnpRole = roleMap.get(dnpPlayer) ?? "";
        const candidateRole = roleMap.get(candidate) ?? "";
        if (candidateRole === dnpRole) {
          bestSub = candidate;
          break;
        }
        // Otherwise, remember first valid sub but keep looking for a role match
        if (!bestSub) bestSub = candidate;
      }
    }

    if (bestSub) {
      substitutions.push({ out: dnpPlayer, in: bestSub });
      effectiveXi[idx] = bestSub;
      usedSubs.add(bestSub);
    }
    // If no valid sub, player stays in XI but gets 0 points (no match data)
  }

  return { effectiveXi, effectiveCaptain, effectiveVc, substitutions };
}
