export type JoinTarget =
  | { kind: "room"; url: string }
  | { kind: "league"; url: string }
  | { kind: "not-found" };

export function resolveJoinTarget(
  room: { id: string } | null | undefined,
  league: { id: string; league_kind: string } | null | undefined,
): JoinTarget {
  if (room?.id) return { kind: "room", url: `/room/${room.id}/lobby` };
  if (league?.id) {
    const url =
      league.league_kind === "private" ? `/league/private/${league.id}` : `/league/${league.id}`;
    return { kind: "league", url };
  }
  return { kind: "not-found" };
}

export function normalizeInviteCode(raw: string): { code: string; codeRaw: string } {
  const codeRaw = (raw ?? "").trim();
  return { code: codeRaw.toUpperCase(), codeRaw };
}
