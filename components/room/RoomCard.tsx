import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCardLink } from "@/components/ui/clickable-card-link";
import type { AuctionRoom } from "@/lib/sports/types";
import { ChevronRight } from "lucide-react";

export function RoomCard({
  room,
  teamsCount,
  role,
}: {
  room: AuctionRoom;
  teamsCount: number;
  role: "host" | "member";
}) {
  const status = room.status;
  const badgeVariant = status === "live" ? "live" : status === "completed" ? "secondary" : "subtle";

  const href =
    status === "lobby" || status === "paused"
      ? `/room/${room.id}/lobby`
      : status === "live"
        ? `/room/${room.id}/auction`
        : `/room/${room.id}/results`;

  const cfg = room.config as { maxTeams?: number };
  const maxTeams = cfg.maxTeams ?? 10;

  return (
    <ClickableCardLink href={href}>
      <Card className="h-full rounded-2xl border-neutral-800/90 bg-neutral-950/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold text-white transition-colors group-hover:text-blue-100">
            {room.name}
          </CardTitle>
          <ChevronRight className="h-5 w-5 shrink-0 text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-300 motion-reduce:group-hover:translate-x-0" />
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          <Badge variant={badgeVariant}>{status.toUpperCase()}</Badge>
          <span className="text-neutral-500">
            {teamsCount}/{maxTeams} teams
          </span>
          <span className="text-neutral-600">·</span>
          <span className={role === "host" ? "font-medium text-amber-200/90" : ""}>
            {role === "host" ? "Host" : "Participant"}
          </span>
          <span className="text-neutral-600">·</span>
          <span className="font-mono text-xs tracking-wider text-blue-300/90">{room.invite_code}</span>
        </CardContent>
      </Card>
    </ClickableCardLink>
  );
}
