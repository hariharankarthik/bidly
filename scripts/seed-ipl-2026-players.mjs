#!/usr/bin/env node
/**
 * Seed all IPL 2026 players from data/ipl-2026-players.json into the players table.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-ipl-2026-players.mjs
 *
 * The script upserts by normalized name + sport_id so it can be re-run safely.
 * Existing auto-created players (from sheet imports) are UPDATED rather than duplicated.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPORT_ID = "ipl_2026";
const BATCH_SIZE = 50;

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const raw = JSON.parse(readFileSync(resolve(__dirname, "../data/ipl-2026-players.json"), "utf-8"));
console.log(`Loaded ${raw.length} players from JSON`);

// Fetch existing players for this sport so we can decide insert vs update
const { data: existing, error: fetchErr } = await supabase
  .from("players")
  .select("id, name")
  .eq("sport_id", SPORT_ID);
if (fetchErr) {
  console.error("Failed to fetch existing players:", fetchErr.message);
  process.exit(1);
}

const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const existingByName = new Map((existing ?? []).map((p) => [norm(p.name), p]));
console.log(`Found ${existingByName.size} existing players for ${SPORT_ID}`);

let updated = 0;
let inserted = 0;
let skipped = 0;

for (let i = 0; i < raw.length; i += BATCH_SIZE) {
  const batch = raw.slice(i, i + BATCH_SIZE);

  const toUpdate = [];
  const toInsert = [];

  for (const p of batch) {
    const key = norm(p.name);
    const match = existingByName.get(key);
    if (match) {
      toUpdate.push({
        id: match.id,
        role: p.role,
        nationality: p.nationality,
        is_overseas: p.is_overseas,
        base_price: p.base_price,
        tier: p.tier ?? null,
        ipl_team: p.ipl_team ?? null,
      });
    } else {
      toInsert.push({
        sport_id: SPORT_ID,
        name: p.name,
        role: p.role,
        nationality: p.nationality,
        is_overseas: p.is_overseas,
        base_price: p.base_price,
        tier: p.tier ?? null,
        ipl_team: p.ipl_team ?? null,
        stats: {},
        image_url: null,
      });
    }
  }

  // Update existing players (preserves their UUIDs used in squad_player_ids)
  for (const row of toUpdate) {
    const { id, ...fields } = row;
    const { error } = await supabase.from("players").update(fields).eq("id", id);
    if (error) {
      console.error(`  ✗ update ${id}: ${error.message}`);
      skipped++;
    } else {
      updated++;
    }
  }

  // Insert new players
  if (toInsert.length) {
    const { error } = await supabase.from("players").insert(toInsert);
    if (error) {
      console.error(`  ✗ insert batch: ${error.message}`);
      skipped += toInsert.length;
    } else {
      inserted += toInsert.length;
    }
  }

  process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${toUpdate.length} updated, ${toInsert.length} inserted\n`);
}

console.log(`\nDone: ${updated} updated, ${inserted} inserted, ${skipped} skipped`);
