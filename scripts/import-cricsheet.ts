#!/usr/bin/env npx tsx
/**
 * Cricsheet IPL bulk import script.
 *
 * Downloads the IPL JSON archive from cricsheet.org, extracts match files,
 * aggregates ball-by-ball data into player performances, and caches them
 * in a `cricsheet_cache` Supabase table for use as a fallback when CricAPI
 * is rate-limited.
 *
 * Usage:
 *   npx tsx scripts/import-cricsheet.ts                     # Import all IPL matches
 *   npx tsx scripts/import-cricsheet.ts --season 2026       # Import specific season
 *   npx tsx scripts/import-cricsheet.ts --match 1527676     # Import specific match
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { parseCricsheetMatch } from "@/lib/cricsheet/fetch-scorecard";

const CRICSHEET_IPL_URL = "https://cricsheet.org/downloads/ipl_json.zip";
const TMP_DIR = path.join("/tmp", "cricsheet-import");

function log(msg: string) {
  console.log(`[cricsheet-import] ${msg}`);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Parse CLI args
  const args = process.argv.slice(2);
  const seasonFilter = args.includes("--season") ? args[args.indexOf("--season") + 1] : null;
  const matchFilter = args.includes("--match") ? args[args.indexOf("--match") + 1] : null;

  // Download and extract
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const zipPath = path.join(TMP_DIR, "ipl_json.zip");

  if (!fs.existsSync(zipPath) || Date.now() - fs.statSync(zipPath).mtimeMs > 6 * 3600_000) {
    log("Downloading IPL archive from cricsheet.org...");
    execSync(`curl -sL "${CRICSHEET_IPL_URL}" -o "${zipPath}"`);
    log("Extracting...");
    execSync(`unzip -o "${zipPath}" -d "${TMP_DIR}/matches"`, { stdio: "pipe" });
  } else {
    log("Using cached ZIP (< 6h old)");
    if (!fs.existsSync(path.join(TMP_DIR, "matches"))) {
      execSync(`unzip -o "${zipPath}" -d "${TMP_DIR}/matches"`, { stdio: "pipe" });
    }
  }

  const matchDir = path.join(TMP_DIR, "matches");
  let files = fs.readdirSync(matchDir).filter((f) => f.endsWith(".json"));

  if (matchFilter) {
    files = files.filter((f) => f.replace(".json", "") === matchFilter);
    if (files.length === 0) {
      console.error(`Match ${matchFilter} not found in archive`);
      process.exit(1);
    }
  }

  log(`Found ${files.length} match files`);

  // Ensure cache table exists
  log("Ensuring cricsheet_cache table exists...");
  const { error: tableErr } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS cricsheet_cache (
        match_id TEXT PRIMARY KEY,
        season TEXT,
        teams TEXT[],
        event_name TEXT,
        match_date TEXT,
        performances JSONB NOT NULL,
        imported_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  });
  if (tableErr) {
    log(`Note: Could not auto-create table (${tableErr.message}). Create it manually if needed.`);
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const matchId = file.replace(".json", "");
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(matchDir, file), "utf-8"));
      const info = raw.info;

      // Season filter
      if (seasonFilter && String(info.season) !== seasonFilter) {
        skipped++;
        continue;
      }

      // Check if IPL
      const eventName = info.event?.name ?? "";
      if (!eventName.toLowerCase().includes("indian premier league") && !eventName.toLowerCase().includes("ipl")) {
        skipped++;
        continue;
      }

      const performances = parseCricsheetMatch(raw);

      const row = {
        match_id: matchId,
        season: String(info.season ?? ""),
        teams: info.teams,
        event_name: eventName,
        match_date: info.dates?.[0] ?? "",
        performances,
      };

      const { error } = await supabase
        .from("cricsheet_cache")
        .upsert(row, { onConflict: "match_id" });

      if (error) {
        console.error(`  Error importing ${matchId}: ${error.message}`);
        errors++;
      } else {
        imported++;
        if (imported % 50 === 0) log(`  Imported ${imported} matches...`);
      }
    } catch (e) {
      console.error(`  Failed to parse ${matchId}: ${e instanceof Error ? e.message : e}`);
      errors++;
    }
  }

  log(`Done. Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);

  // Cleanup
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
