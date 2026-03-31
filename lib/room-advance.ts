import type { SupabaseClient } from "@supabase/supabase-js";

type RoomRow = {
  sport_id: string;
  queue_index: number;
  player_queue: string[];
  host_id: string;
  name: string;
};

export async function advanceLotAfterResult(
  supabase: SupabaseClient,
  roomId: string,
  room: RoomRow,
): Promise<{ completed: boolean }> {
  const nextIndex = room.queue_index + 1;
  if (nextIndex >= room.player_queue.length) {
    await supabase
      .from("auction_rooms")
      .update({
        status: "completed",
        current_player_id: null,
        current_bidder_team_id: null,
      })
      .eq("id", roomId);

    const { data: existing } = await supabase
      .from("fantasy_leagues")
      .select("id")
      .eq("room_id", roomId)
      .maybeSingle();

    const row = {
      room_id: roomId,
      sport_id: room.sport_id,
      status: "active" as const,
      host_id: room.host_id,
      name: room.name,
      league_kind: "auction" as const,
    };

    if (existing?.id) {
      await supabase.from("fantasy_leagues").update(row).eq("id", existing.id);
    } else {
      await supabase.from("fantasy_leagues").insert(row);
    }

    return { completed: true };
  }

  const nextPlayerId = room.player_queue[nextIndex]!;
  const { data: nextPlayer } = await supabase
    .from("players")
    .select("base_price")
    .eq("id", nextPlayerId)
    .single();

  await supabase
    .from("auction_rooms")
    .update({
      current_player_id: nextPlayerId,
      current_bid: nextPlayer?.base_price ?? 0,
      current_bidder_team_id: null,
      queue_index: nextIndex,
    })
    .eq("id", roomId);

  return { completed: false };
}
