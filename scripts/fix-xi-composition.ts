/**
 * One-time script to fix invalid Playing XI compositions in existing leagues.
 *
 * Usage:
 *   npx tsx scripts/fix-xi-composition.ts          # dry-run (prints changes, no DB writes)
 *   npx tsx scripts/fix-xi-composition.ts --apply   # apply changes to DB
 */

import { createClient } from "@supabase/supabase-js";
import { validateXiComposition, fixXiComposition } from "../lib/xi-composition";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log(`Mode: ${apply ? "APPLY (will write to DB)" : "DRY-RUN (no changes)"}\n`);

  // Fetch all private teams with non-empty XI
  const { data: teams, error: tErr } = await supabase
    .from("private_league_teams")
    .select("id, team_name, squad_player_ids, squad_player_prices, starting_xi_player_ids, captain_player_id, vice_captain_player_id")
    .neq("starting_xi_player_ids", "{}");

  if (tErr) {
    console.error("Failed to fetch teams:", tErr.message);
    process.exit(1);
  }

  if (!teams || teams.length === 0) {
    console.log("No teams with Playing XI found.");
    return;
  }

  // Collect all player IDs
  const allPlayerIds = [...new Set(teams.flatMap((t) => (t.squad_player_ids as string[]) ?? []))];
  const { data: playerRows, error: pErr } = await supabase
    .from("players")
    .select("id, role, base_price")
    .in("id", allPlayerIds);

  if (pErr) {
    console.error("Failed to fetch players:", pErr.message);
    process.exit(1);
  }

  const roleMap = new Map<string, string>();
  const basePriceMap = new Map<string, number>();
  for (const p of playerRows ?? []) {
    roleMap.set(p.id, p.role ?? "BAT");
    basePriceMap.set(p.id, p.base_price ?? 0);
  }

  let fixedCount = 0;
  let validCount = 0;
  let errorCount = 0;

  for (const t of teams) {
    const xi = (t.starting_xi_player_ids as string[]) ?? [];
    const squad = (t.squad_player_ids as string[]) ?? [];
    const spent = (t.squad_player_prices as Record<string, number>) ?? {};

    if (xi.length === 0) continue;

    const result = validateXiComposition(xi, roleMap);
    if (result.valid) {
      validCount++;
      continue;
    }

    console.log(`\n❌ Team "${t.team_name}" (${t.id}): ${result.errors.join("; ")}`);

    // Build price map
    const priceMap = new Map<string, number>();
    for (const pid of squad) {
      priceMap.set(pid, Number(spent[pid] ?? 0) || (basePriceMap.get(pid) ?? 0));
    }

    const { xi: fixedXi, swaps } = fixXiComposition(xi, squad, roleMap, priceMap);

    if (swaps.length === 0) {
      console.log("   ⚠️  Could not fix — bench may lack required roles");
      errorCount++;
      continue;
    }

    for (const s of swaps) {
      const outRole = roleMap.get(s.out) ?? "?";
      const inRole = roleMap.get(s.in) ?? "?";
      console.log(`   🔄 OUT: ${s.out} (${outRole}) → IN: ${s.in} (${inRole})`);
    }

    // Verify the fix
    const postFix = validateXiComposition(fixedXi, roleMap);
    if (!postFix.valid) {
      console.log(`   ⚠️  Post-fix still invalid: ${postFix.errors.join("; ")}`);
      errorCount++;
      continue;
    }

    // Check if captain/VC still in XI
    let newCaptain = t.captain_player_id;
    let newVc = t.vice_captain_player_id;
    const fixedSet = new Set(fixedXi);
    if (newCaptain && !fixedSet.has(newCaptain)) {
      // Re-assign captain to most expensive in fixed XI
      const sorted = fixedXi.slice().sort((a, b) => (priceMap.get(b) ?? 0) - (priceMap.get(a) ?? 0));
      newCaptain = sorted[0] ?? null;
      console.log(`   👑 Captain reassigned to ${newCaptain}`);
    }
    if (newVc && !fixedSet.has(newVc)) {
      const sorted = fixedXi.slice().sort((a, b) => (priceMap.get(b) ?? 0) - (priceMap.get(a) ?? 0));
      newVc = sorted.find((id) => id !== newCaptain) ?? null;
      console.log(`   🏅 Vice-Captain reassigned to ${newVc}`);
    }

    if (apply) {
      const { error: uErr } = await supabase
        .from("private_league_teams")
        .update({
          starting_xi_player_ids: fixedXi,
          captain_player_id: newCaptain,
          vice_captain_player_id: newVc,
        })
        .eq("id", t.id);

      if (uErr) {
        console.log(`   ❌ DB update failed: ${uErr.message}`);
        errorCount++;
        continue;
      }
      console.log("   ✅ Fixed and saved");
    } else {
      console.log("   📋 Would fix (run with --apply to save)");
    }

    fixedCount++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Valid: ${validCount}`);
  console.log(`Fixed: ${fixedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${teams.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
