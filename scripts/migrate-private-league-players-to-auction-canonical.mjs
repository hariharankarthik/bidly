#!/usr/bin/env node
/**
 * Migrate private-league team roster references to canonical auction players.
 *
 * Problem:
 * - `private_league_teams.squad_player_ids` may reference "duplicate" player rows created earlier
 *   (e.g. "Phil Salt" vs canonical auction "Philip Salt").
 * - After seeding canonical auction pool from Cricbuzz, we want private leagues to reference
 *   the canonical `players` rows, then delete the old duplicates.
 *
 * This script:
 * - Loads the auction CSV (name list) and maps auction-name -> canonical player_id in Supabase
 * - Scans `private_league_teams` for leagues where `fantasy_leagues.sport_id == sportId`
 * - For any referenced player_id whose `players.name` is NOT in the auction list,
 *   attempts to map by name variants to a canonical auction player_id
 * - Updates arrays and captain/vice references
 *
 * Safe-by-default: dry-run unless --apply true
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/migrate-private-league-players-to-auction-canonical.mjs \
 *     --sport ipl_2026 \
 *     --auction-csv data/ipl_auction_cricbuzz_ipl_2026.csv
 *
 * To actually write updates:
 *   ... --apply true
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";

function argValue(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return fallback;
  return v;
}

function boolArg(name, fallback = false) {
  const v = argValue(name, null);
  if (v == null) return fallback;
  return ["true", "1", "yes", "y"].includes(String(v).trim().toLowerCase());
}

function normalizeName(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function keyName(s) {
  return normalizeName(s).toLowerCase().replace(/\./g, "");
}

function parseCsv(text) {
  // Minimal CSV parser (handles quotes/double-quotes).
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cur);
      cur = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") continue;
    cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function uniq(list) {
  const out = [];
  const seen = new Set();
  for (const x of list) {
    if (x == null) continue;
    const s = String(x);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(x);
  }
  return out;
}

function buildNameVariants(name) {
  const base = normalizeName(name);
  const out = [base];
  const noDots = base.replace(/\./g, "");
  if (noDots !== base) out.push(noDots);

  // Drop first initial: "R Sai Kishore" -> "Sai Kishore"
  const dropInitial = noDots.replace(/^[A-Z]\s+/, "").trim();
  if (dropInitial && dropInitial !== noDots) out.push(dropInitial);

  // Known Cricbuzz-style full name expansions.
  // Example: "R. Sai Kishore" often appears as "Ravisrinivasan Sai Kishore" in auction lists.
  if (/\bsai kishore\b/i.test(noDots)) {
    out.push("Ravisrinivasan Sai Kishore");
  }

  // Common Cricbuzz vs elsewhere variants
  const swaps = [
    (s) => s.replace(/\bPhil\b/i, "Philip"),
    (s) => s.replace(/\bMohammad\b/i, "Mohammed"),
    (s) => s.replace(/\bChakravarthy\b/i, "Chakaravarthy"),
  ];
  for (const fn of swaps) {
    const v1 = normalizeName(fn(base));
    const v2 = normalizeName(fn(noDots));
    const v3 = dropInitial ? normalizeName(fn(dropInitial)) : "";
    if (v1 && v1 !== base) out.push(v1);
    if (v2 && v2 !== noDots) out.push(v2);
    if (v3 && v3 !== dropInitial) out.push(v3);
  }

  // Unique by normalized key
  const seen = new Set();
  const uniqOut = [];
  for (const v of out) {
    const k = keyName(v);
    if (seen.has(k)) continue;
    seen.add(k);
    uniqOut.push(v);
  }
  return uniqOut;
}

const sportId = argValue("sport", "ipl_2026");
const auctionCsvPath = argValue("auction-csv", `data/ipl_auction_cricbuzz_${sportId}.csv`);
const apply = boolArg("apply", false);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function main() {
  const csv = await fs.readFile(auctionCsvPath, "utf8");
  const grid = parseCsv(csv.trim() + "\n");
  const headers = grid[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const nameIdx = headers.indexOf("name");
  if (nameIdx < 0) throw new Error(`auction csv missing 'name' column: ${auctionCsvPath}`);

  const auctionNames = uniq(
    grid
      .slice(1)
      .map((r) => normalizeName(r[nameIdx] ?? ""))
      .filter(Boolean),
  );
  const auctionKeySet = new Set(auctionNames.map((n) => keyName(n)));
  console.log(`Auction names: ${auctionNames.length}`);

  // Load all players for sport, keyed by normalized name (no dots, lowercase).
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, name, sport_id")
    .eq("sport_id", sportId);
  if (pErr) throw pErr;

  const byNameKey = new Map();
  for (const p of players ?? []) {
    byNameKey.set(keyName(p.name), p.id);
  }

  // Build canonical auction name -> id map (must exist; if not, seeding wasn't run).
  const auctionNameToId = new Map();
  const missingCanonical = [];
  for (const n of auctionNames) {
    const id = byNameKey.get(keyName(n));
    if (!id) missingCanonical.push(n);
    else auctionNameToId.set(keyName(n), id);
  }
  if (missingCanonical.length) {
    throw new Error(
      `Canonical auction players missing in DB (${missingCanonical.length}). Run the Cricbuzz seeder first. Example: ${missingCanonical[0]}`,
    );
  }

  // Load private leagues for sport.
  const { data: leagues, error: lErr } = await supabase
    .from("fantasy_leagues")
    .select("id, sport_id, league_kind")
    .eq("sport_id", sportId)
    .eq("league_kind", "private");
  if (lErr) throw lErr;
  const leagueIds = (leagues ?? []).map((l) => l.id);
  console.log(`Private leagues for ${sportId}: ${leagueIds.length}`);
  if (!leagueIds.length) return;

  const { data: teams, error: tErr } = await supabase
    .from("private_league_teams")
    .select("id, league_id, team_name, squad_player_ids, starting_xi_player_ids, captain_player_id, vice_captain_player_id")
    .in("league_id", leagueIds);
  if (tErr) throw tErr;

  const teamRows = teams ?? [];
  console.log(`Private league teams scanned: ${teamRows.length}`);

  // Build id -> name map for sport (to detect non-auction references).
  const idToName = new Map((players ?? []).map((p) => [p.id, normalizeName(p.name)]));

  const updates = [];
  const unmapped = [];
  let changedTeams = 0;
  let changedRefs = 0;

  for (const team of teamRows) {
    const beforeSquad = Array.isArray(team.squad_player_ids) ? team.squad_player_ids : [];
    const beforeXi = Array.isArray(team.starting_xi_player_ids) ? team.starting_xi_player_ids : [];
    const beforeC = team.captain_player_id ?? null;
    const beforeVC = team.vice_captain_player_id ?? null;

    const mapId = (pid) => {
      if (!pid) return pid;
      const name = idToName.get(pid);
      if (!name) return pid;
      if (auctionKeySet.has(keyName(name))) return pid; // already canonical

      // Try to map by name variants to a canonical auction player
      const variants = buildNameVariants(name);
      for (const v of variants) {
        const k = keyName(v);
        const canonicalId = auctionNameToId.get(k);
        if (canonicalId) return canonicalId;
      }
      unmapped.push({ team_id: team.id, team_name: team.team_name, player_id: pid, name });
      return pid;
    };

    const afterSquad = uniq(beforeSquad.map(mapId));
    const afterXi = uniq(beforeXi.map(mapId));
    const afterC = mapId(beforeC);
    const afterVC = mapId(beforeVC);

    const changed =
      afterC !== beforeC ||
      afterVC !== beforeVC ||
      afterSquad.length !== beforeSquad.length ||
      afterXi.length !== beforeXi.length ||
      afterSquad.some((x, i) => x !== beforeSquad[i]) ||
      afterXi.some((x, i) => x !== beforeXi[i]);

    if (!changed) continue;

    changedTeams += 1;
    changedRefs +=
      (afterC !== beforeC ? 1 : 0) +
      (afterVC !== beforeVC ? 1 : 0) +
      afterSquad.filter((x, i) => x !== beforeSquad[i]).length +
      afterXi.filter((x, i) => x !== beforeXi[i]).length;

    updates.push({
      id: team.id,
      squad_player_ids: afterSquad,
      starting_xi_player_ids: afterXi,
      captain_player_id: afterC,
      vice_captain_player_id: afterVC,
    });
  }

  console.log(`Teams needing updates: ${changedTeams}`);
  console.log(`Reference changes (approx): ${changedRefs}`);
  console.log(`Unmapped players: ${unmapped.length}`);
  if (unmapped.length) {
    for (const u of unmapped.slice(0, 30)) {
      console.log(`- Unmapped: ${u.name} (${u.player_id.slice(0, 8)}…) team=${u.team_name}`);
    }
    if (unmapped.length > 30) console.log(`... +${unmapped.length - 30} more`);
  }

  if (!updates.length) {
    console.log("No updates needed.");
    return;
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply true to write updates.");
    return;
  }

  // IMPORTANT: use UPDATE, not UPSERT.
  // Upsert requires all NOT NULL columns (league_id, owner_id, team_name, ...) and can fail.
  // We only want to patch player-id fields on existing rows.
  const CHUNK = 25;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    // Run sequentially within chunk to keep logs readable and avoid spiky load.
    for (const u of chunk) {
      const { error: upErr } = await supabase
        .from("private_league_teams")
        .update({
          squad_player_ids: u.squad_player_ids,
          starting_xi_player_ids: u.starting_xi_player_ids,
          captain_player_id: u.captain_player_id,
          vice_captain_player_id: u.vice_captain_player_id,
        })
        .eq("id", u.id);
      if (upErr) throw upErr;
    }
    console.log(`- updated teams ${Math.min(i + chunk.length, updates.length)}/${updates.length}`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

