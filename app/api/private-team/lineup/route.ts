import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const MAX_XI = 11;
const MAX_OVERSEAS_XI_IPL = 4;

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
  if (xi.length > MAX_XI) {
    return NextResponse.json({ error: `Starting XI can have at most ${MAX_XI} players` }, { status: 400 });
  }

  const { data: team, error: tErr } = await supabase
    .from("private_league_teams")
    .select("id, league_id, claimed_by, squad_player_ids")
    .eq("id", private_team_id)
    .single();
  if (tErr || !team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("id, host_id, league_kind, sport_id")
    .eq("id", team.league_id)
    .maybeSingle();
  if (!league || league.league_kind !== "private") {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  const isHost = league.host_id === user.id;
  const isOwner = team.claimed_by === user.id;
  if (!isHost && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const squad = new Set((Array.isArray(team.squad_player_ids) ? team.squad_player_ids : []).filter(Boolean) as string[]);

  // If a user tries to set an XI, require a complete XI once they have enough players.
  if (xi.length > 0) {
    if (squad.size < MAX_XI) {
      return NextResponse.json(
        { error: `You need at least ${MAX_XI} players on your squad before you can set a Playing XI` },
        { status: 400 },
      );
    }
    if (xi.length !== MAX_XI) {
      return NextResponse.json({ error: `Playing XI must have exactly ${MAX_XI} players` }, { status: 400 });
    }
  }

  for (const pid of xi) {
    if (!squad.has(pid)) {
      return NextResponse.json({ error: "Starting XI must be players on your squad" }, { status: 400 });
    }
  }

  if (league.sport_id === "ipl_2026" && xi.length > 0) {
    const { data: xiPlayers, error: xErr } = await supabase
      .from("players")
      .select("id, is_overseas")
      .in("id", xi);
    if (xErr) return NextResponse.json({ error: xErr.message }, { status: 500 });
    const overseas = (xiPlayers ?? []).filter((p) => p.is_overseas).length;
    if (overseas > MAX_OVERSEAS_XI_IPL) {
      return NextResponse.json(
        { error: `Starting XI can include at most ${MAX_OVERSEAS_XI_IPL} overseas players` },
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
  }

  if (captain_player_id && vice_captain_player_id && captain_player_id === vice_captain_player_id) {
    return NextResponse.json({ error: "Captain and vice-captain must be different players" }, { status: 400 });
  }

  const { error: uErr } = await supabase
    .from("private_league_teams")
    .update({
      starting_xi_player_ids: xi,
      captain_player_id: captain_player_id ?? null,
      vice_captain_player_id: vice_captain_player_id ?? null,
    })
    .eq("id", private_team_id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

