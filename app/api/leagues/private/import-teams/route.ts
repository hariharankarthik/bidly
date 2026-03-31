import { createClient } from "@/lib/supabase/server";
import {
  buildPrivateTeamsFromRows,
  sheetTextToNormalizedRows,
  type SheetColumnMapping,
} from "@/lib/leagues/private-sheet-import";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    league_id?: string;
    sheet_text?: string;
    mapping?: SheetColumnMapping;
    dry_run?: boolean;
  };

  const league_id = body.league_id?.trim();
  const sheet_text = body.sheet_text?.trim();
  const mapping = body.mapping;
  if (!league_id || !sheet_text || !mapping?.player_name?.trim()) {
    return NextResponse.json({ error: "league_id, sheet_text, and mapping.player_name required" }, { status: 400 });
  }

  const { data: league, error: lErr } = await supabase
    .from("fantasy_leagues")
    .select("id, host_id, sport_id, league_kind")
    .eq("id", league_id)
    .single();

  if (lErr || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.host_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (league.league_kind !== "private") {
    return NextResponse.json({ error: "Only private sheet leagues accept roster import" }, { status: 400 });
  }

  const rows = sheetTextToNormalizedRows(sheet_text, mapping);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No data rows parsed — check delimiter, headers, and column mapping.", sample_row_count: 0 },
      { status: 400 },
    );
  }

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, name")
    .eq("sport_id", league.sport_id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { teams, unmatched, duplicate_player_warnings } = buildPrivateTeamsFromRows(players ?? [], rows);

  if (body.dry_run) {
    return NextResponse.json({
      dry_run: true,
      team_count: teams.length,
      player_slots: teams.reduce((n, t) => n + t.squad_player_ids.length, 0),
      teams: teams.map((t) => ({
        team_name: t.team_name,
        squad_size: t.squad_player_ids.length,
        captain_player_id: t.captain_player_id,
        vice_captain_player_id: t.vice_captain_player_id,
      })),
      unmatched_names: unmatched,
      warnings: duplicate_player_warnings,
    });
  }

  if (teams.length === 0) {
    return NextResponse.json(
      {
        error: "No teams could be built (all players unmatched or duplicate across teams).",
        unmatched_names: unmatched,
        warnings: duplicate_player_warnings,
      },
      { status: 400 },
    );
  }

  const { error: delErr } = await supabase.from("private_league_teams").delete().eq("league_id", league_id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const insert = teams.map((t) => ({
    league_id,
    owner_id: user.id,
    team_name: t.team_name,
    squad_player_ids: t.squad_player_ids,
    starting_xi_player_ids: [] as string[],
    captain_player_id: t.captain_player_id,
    vice_captain_player_id: t.vice_captain_player_id,
    team_color: "#6366f1",
  }));

  const { error: insErr } = await supabase.from("private_league_teams").insert(insert);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    teams_imported: insert.length,
    unmatched_names: unmatched,
    warnings: duplicate_player_warnings,
  });
}
