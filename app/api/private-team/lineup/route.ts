import { createClient } from "@/lib/supabase/server";
import { getSportConfig } from "@/lib/sports";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    private_team_id?: string;
    starting_xi_player_ids?: string[];
    captain_player_id?: string | null;
    vice_captain_player_id?: string | null;
  };

  const { private_team_id, starting_xi_player_ids, captain_player_id, vice_captain_player_id } = body;
  if (!private_team_id) return NextResponse.json({ error: "private_team_id required" }, { status: 400 });

  const xi = Array.isArray(starting_xi_player_ids) ? [...new Set(starting_xi_player_ids)] : [];

  const { data: team, error: tErr } = await supabase
    .from("private_league_teams")
    .select("id, league_id, claimed_by, squad_player_ids, xi_confirmed_at")
    .eq("id", private_team_id)
    .single();
  if (tErr || !team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("id, host_id, league_kind, sport_id, status")
    .eq("id", team.league_id)
    .maybeSingle();
  if (!league || league.league_kind !== "private") {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }
  if (league.status !== "active") {
    return NextResponse.json({ error: "League must be started before setting lineup" }, { status: 400 });
  }

  const cfg = getSportConfig(league.sport_id);
  const xiSize = cfg?.lineup?.xiSize ?? 11;
  const maxOverseasInXi = cfg?.lineup?.maxOverseasInXi ?? null;

  if (xi.length > xiSize) {
    return NextResponse.json({ error: `Playing XI can have at most ${xiSize} players` }, { status: 400 });
  }

  const isHost = league.host_id === user.id;
  const isOwner = team.claimed_by === user.id;
  if (!isHost && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const squad = new Set((Array.isArray(team.squad_player_ids) ? team.squad_player_ids : []).filter(Boolean) as string[]);

  // If a user tries to set an XI, require a complete XI once they have enough players.
  if (xi.length > 0) {
    if (squad.size < xiSize) {
      return NextResponse.json(
        { error: `You need at least ${xiSize} players on your squad before you can set a Playing XI` },
        { status: 400 },
      );
    }
    if (xi.length !== xiSize) {
      return NextResponse.json({ error: `Playing XI must have exactly ${xiSize} players` }, { status: 400 });
    }
  }

  for (const pid of xi) {
    if (!squad.has(pid)) {
      return NextResponse.json({ error: "Starting XI must be players on your squad" }, { status: 400 });
    }
  }

  if (maxOverseasInXi != null && xi.length > 0) {
    const { data: xiPlayers, error: xErr } = await supabase
      .from("players")
      .select("id, is_overseas")
      .in("id", xi);
    if (xErr) return NextResponse.json({ error: xErr.message }, { status: 500 });
    const overseas = (xiPlayers ?? []).filter((p) => p.is_overseas).length;
    if (overseas > maxOverseasInXi) {
      return NextResponse.json(
        { error: `Playing XI can include at most ${maxOverseasInXi} overseas players` },
        { status: 400 },
      );
    }
  }

  if (xi.length > 0) {
    if (captain_player_id && !xi.includes(captain_player_id)) {
      return NextResponse.json({ error: "Captain must be in starting XI" }, { status: 400 });
    }
    if (vice_captain_player_id && !xi.includes(vice_captain_player_id)) {
      return NextResponse.json({ error: "Vice-captain must be in starting XI" }, { status: 400 });
    }
    if (!captain_player_id || !vice_captain_player_id) {
      return NextResponse.json({ error: "Captain and Vice-Captain are required to save your Playing XI" }, { status: 400 });
    }
  }

  if (captain_player_id && vice_captain_player_id && captain_player_id === vice_captain_player_id) {
    return NextResponse.json({ error: "Captain and vice-captain must be different players" }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {
    starting_xi_player_ids: xi,
    captain_player_id: captain_player_id ?? null,
    vice_captain_player_id: vice_captain_player_id ?? null,
  };

  // Mark first-ever XI confirmation (never cleared, used for scoring gate)
  if (xi.length > 0 && !team.xi_confirmed_at) {
    updatePayload.xi_confirmed_at = new Date().toISOString();
  }

  const { error: uErr } = await supabase
    .from("private_league_teams")
    .update(updatePayload)
    .eq("id", private_team_id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

