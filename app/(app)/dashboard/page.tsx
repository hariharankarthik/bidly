import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RoomCard } from "@/components/room/RoomCard";
import { JoinModal } from "@/components/room/JoinModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AuctionRoom } from "@/lib/sports/types";
import { IPL_2026 } from "@/lib/sports/ipl";
import { NFL_2026 } from "@/lib/sports/nfl";
import { PlusCircle, Sparkles, Users, Wand2 } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "there";

  const { data: hosted } = await supabase.from("auction_rooms").select("*").eq("host_id", user.id);

  const { data: privateHosted } = await supabase
    .from("fantasy_leagues")
    .select("id, name, invite_code, sport_id, created_at")
    .eq("host_id", user.id)
    .eq("league_kind", "private")
    .order("created_at", { ascending: false });

  const { data: memberships } = await supabase
    .from("auction_teams")
    .select("room_id, auction_rooms (*)")
    .eq("owner_id", user.id);

  const memberRooms = (memberships ?? [])
    .map((m) => m.auction_rooms as unknown as AuctionRoom | null)
    .filter(Boolean) as AuctionRoom[];

  const hostedRooms = (hosted ?? []) as AuctionRoom[];
  const byId = new Map<string, { room: AuctionRoom; role: "host" | "member" }>();
  for (const r of hostedRooms) byId.set(r.id, { room: r, role: "host" });
  for (const r of memberRooms) {
    if (!byId.has(r.id)) byId.set(r.id, { room: r, role: "member" });
  }

  const roomRows = [...byId.values()];

  const countResults = await Promise.all(
    roomRows.map(async ({ room }) => {
      const { count } = await supabase
        .from("auction_teams")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id);
      return [room.id, count ?? 0] as const;
    }),
  );
  const counts = Object.fromEntries(countResults) as Record<string, number>;

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:px-6 sm:py-10">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-950/45 via-neutral-950/70 to-emerald-950/25 p-6 sm:p-8 shadow-[0_0_80px_-20px_rgba(139,92,246,0.35)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_100%_-10%,rgba(16,185,129,0.12),transparent)]" />
        <div className="relative z-10">
          <p className="text-sm font-medium text-violet-300/90">Welcome back</p>
          <h1 className="aa-display mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{displayName}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400 sm:text-base">
            Run a mega auction room, or spin up a{" "}
            <span className="text-violet-200/95">private sheet league</span> — import squads and keep the same fantasy scoring.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              size="lg"
              className="h-11 gap-2 border border-emerald-400/20 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-900/30 sm:min-w-[200px]"
            >
              <Link href="/room/create">
                <PlusCircle className="h-4 w-4" aria-hidden />
                Create auction room
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="h-11 gap-2 border border-violet-400/25 bg-violet-950/50 text-violet-100 hover:bg-violet-900/50 sm:min-w-[200px]"
            >
              <Link href="/league/private/create">
                <Wand2 className="h-4 w-4" aria-hidden />
                Private sheet league
              </Link>
            </Button>
            <div className="flex h-11 items-center justify-center sm:justify-start">
              <JoinModal />
            </div>
          </div>
        </div>
      </div>

      {privateHosted && privateHosted.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Your sheet leagues</h2>
          </div>
          <div className="grid gap-3">
            {privateHosted.map((pl) => (
              <Link
                key={pl.id}
                href={`/league/private/${pl.id}`}
                className="aa-card-interactive group flex items-center justify-between rounded-xl border border-violet-500/20 bg-neutral-950/50 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-neutral-100 group-hover:text-white">{pl.name}</p>
                  <p className="text-xs text-neutral-500">
                    Code <span className="font-mono text-violet-300/90">{pl.invite_code}</span> ·{" "}
                    <span className="text-neutral-600">/league/p/{pl.invite_code}</span>
                  </p>
                </div>
                <span className="text-xs text-violet-300/80 group-hover:text-violet-200">Open →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Seasons</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="overflow-hidden border-emerald-500/25 bg-gradient-to-b from-emerald-950/40 to-neutral-950/85 shadow-lg shadow-emerald-950/25">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                {IPL_2026.displayName}
                <Badge className="border-0 bg-emerald-500/25 text-emerald-100">Live</Badge>
              </CardTitle>
              <CardDescription className="text-neutral-400">Cricket · mega auction + post-draft fantasy</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-neutral-500">Full player pool seeded — ready when you are.</CardContent>
          </Card>
          <Card className="border-neutral-800/90 bg-neutral-950/50 opacity-70">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-neutral-400">{NFL_2026.displayName}</CardTitle>
              <CardDescription>On the roadmap</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-neutral-600">Same engine, different sport — next phase.</CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-neutral-500" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Your auction rooms</h2>
        </div>
        {roomRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-600/60 bg-neutral-950/40 px-6 py-12 text-center">
            <p className="text-base font-medium text-neutral-300">No auction rooms yet</p>
            <p className="mt-2 text-sm text-neutral-500">
              Create one for your group or paste an invite code from your host.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/room/create">Create your first room</Link>
              </Button>
              <JoinModal />
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {roomRows.map(({ room, role }) => (
              <RoomCard key={room.id} room={room} teamsCount={counts[room.id] ?? 0} role={role} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
