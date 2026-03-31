import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResultsBody, type ResultTeamBlock, type ResultPlayer } from "@/components/results/ResultsBody";

export default async function ResultsPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: room, error } = await supabase.from("auction_rooms").select("*").eq("id", roomId).single();
  if (error || !room) notFound();

  const { data: teams } = await supabase
    .from("auction_teams")
    .select(
      "id, owner_id, team_name, team_color, remaining_purse, players_bought, overseas_count, is_ready, created_at, starting_xi_player_ids, captain_player_id, vice_captain_player_id",
    )
    .eq("room_id", roomId);
  const { data: results } = await supabase.from("auction_results").select("*").eq("room_id", roomId);
  const playerIds = [...new Set((results ?? []).map((r) => r.player_id))];
  const { data: players } =
    playerIds.length > 0
      ? await supabase.from("players").select("*").in("id", playerIds)
      : { data: [] as { id: string; name: string; role: string; is_overseas: boolean; nationality?: string | null }[] };

  const playerById = new Map((players ?? []).map((p) => [p.id, p]));

  const byTeam = new Map<string, NonNullable<typeof results>>();
  for (const r of results ?? []) {
    if (!r.team_id || r.is_unsold) continue;
    const list = byTeam.get(r.team_id) ?? [];
    list.push(r);
    byTeam.set(r.team_id, list);
  }

  const blocks: ResultTeamBlock[] = (teams ?? []).map((team) => {
    const rows = byTeam.get(team.id) ?? [];
    const spend = rows.reduce((s, r) => s + (r.sold_price ?? 0), 0);
    const avg = rows.length ? spend / rows.length : 0;
    const roles: Record<string, number> = {};
    let overseas = 0;
    const plist: ResultPlayer[] = rows.map((r) => {
      const p = playerById.get(r.player_id);
      const role = p?.role ?? "?";
      roles[role] = (roles[role] ?? 0) + 1;
      if (p?.is_overseas) overseas += 1;
      return {
        resultId: r.id,
        playerId: r.player_id,
        name: p?.name ?? r.player_id,
        role,
        isOverseas: Boolean(p?.is_overseas),
        soldPrice: r.sold_price ?? 0,
        nationality: (p as { nationality?: string | null } | undefined)?.nationality ?? null,
      };
    });
    return {
      teamId: team.id,
      ownerId: team.owner_id,
      teamName: team.team_name,
      teamColor: team.team_color,
      spend,
      avg,
      count: rows.length,
      roles,
      overseas,
      players: plist,
      startingXiPlayerIds: Array.isArray(team.starting_xi_player_ids) ? team.starting_xi_player_ids : [],
      captainPlayerId: team.captain_player_id ?? null,
      viceCaptainPlayerId: team.vice_captain_player_id ?? null,
    };
  });

  return (
    <ResultsBody roomId={roomId} roomName={room.name} teams={blocks} myUserId={user?.id ?? ""} sportId={room.sport_id} />
  );
}
