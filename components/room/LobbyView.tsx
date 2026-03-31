"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useAuctionRoom } from "@/hooks/useAuctionRoom";
import { Button } from "@/components/ui/button";
import { TeamSlot } from "./TeamSlot";
import type { AuctionTeam } from "@/lib/sports/types";
import Link from "next/link";
import { Copy, Link2, PartyPopper } from "lucide-react";

const isDev = process.env.NODE_ENV === "development";
/** In dev, host can start with one ready team (solo smoke tests). Production still requires ≥2. */
const MIN_TEAMS_TO_START = isDev ? 1 : 2;

export function LobbyView({
  roomId,
  isHost,
  myTeamId,
  inviteCode,
}: {
  roomId: string;
  isHost: boolean;
  myTeamId: string | null;
  inviteCode: string;
}) {
  const router = useRouter();
  const { room, teams, loading } = useAuctionRoom(roomId);
  const [starting, setStarting] = useState(false);

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${roomId}/lobby`;
  }, [roomId]);

  const readyCount = teams.filter((t) => t.is_ready).length;
  const allReady = teams.length >= MIN_TEAMS_TO_START && teams.every((t) => t.is_ready);
  const canStart = isHost && allReady && room?.status === "lobby";
  const canResume = isHost && room?.status === "paused";

  useEffect(() => {
    if (!room || loading) return;
    if (room.status === "live") {
      router.replace(`/room/${roomId}/auction`);
      return;
    }
    if (room.status === "completed") {
      router.replace(`/room/${roomId}/results`);
    }
  }, [room, loading, roomId, router]);

  async function toggleReady(next: boolean) {
    if (!myTeamId) {
      toast.error("Join the room with a team first");
      return;
    }
    const res = await fetch("/api/room/ready", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: myTeamId, is_ready: next }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || "Failed");
  }

  async function startAuction() {
    setStarting(true);
    try {
      const res = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push(`/room/${roomId}/auction`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    } finally {
      setStarting(false);
    }
  }

  if (loading || !room) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-5 sm:p-8">
        <div className="aa-skeleton h-9 w-2/3 max-w-sm" />
        <div className="aa-skeleton h-4 w-1/3" />
        <div className="aa-skeleton mt-8 h-24 w-full rounded-2xl" />
        <div className="space-y-3">
          <div className="aa-skeleton h-14 w-full rounded-xl" />
          <div className="aa-skeleton h-14 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (room.status === "live" || room.status === "completed") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-neutral-700 border-t-blue-500 motion-reduce:animate-none" aria-hidden />
        <p className="text-sm text-neutral-400">Taking you to the {room.status === "live" ? "live auction" : "results"}…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/90">Pre-match lobby</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{room.name}</h1>
        <p className="mt-2 text-sm text-neutral-400">Invite friends, pick colors, get everyone ready — then go live.</p>
        {room.status === "paused" ? (
          <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/25 px-3 py-2 text-sm text-amber-100/90">
            <strong className="font-medium">Auction paused.</strong> Current player, bids, team purses, and sold players stay in the database — nothing is lost. Host can{" "}
            <Link href={`/room/${roomId}/auction`} className="text-blue-300 underline-offset-2 hover:underline">
              open the live board
            </Link>{" "}
            and tap <strong>Resume</strong>, or resume from here.
          </p>
        ) : null}
        {isDev ? (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
            Dev mode: you can start with <strong>one</strong> ready team. Production still needs two teams.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-950/20 to-white/5 p-5 backdrop-blur-xl sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Invite code</p>
        <p className="aa-invite-code mt-3 text-center font-mono text-2xl text-blue-200 sm:text-3xl">{inviteCode}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteCode);
              toast.success("Code copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy code
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={async () => {
              await navigator.clipboard.writeText(appUrl);
              toast.success("Invite link copied");
            }}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Copy link
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Teams</h2>
          <span className="text-xs text-neutral-500">
            {readyCount}/{teams.length} ready
          </span>
        </div>
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {teams.map((t: AuctionTeam) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <TeamSlot team={t} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      {myTeamId ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void toggleReady(true)} className="gap-2">
            <PartyPopper className="h-4 w-4" aria-hidden />
            I&apos;m ready
          </Button>
          <Button type="button" variant="secondary" onClick={() => void toggleReady(false)}>
            Not ready yet
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/40 px-4 py-3 text-sm text-neutral-500">
          Join this room with a team to flip your ready switch.
        </p>
      )}

      {isHost ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/50 p-5">
          <p className="text-sm font-medium text-white">Host controls</p>
          <p className="mt-1 text-xs text-neutral-500">
            {canResume
              ? "Paused mid-auction — state is saved. Resume to pick up the same lot."
              : allReady
                ? "Everyone’s in — hit start when the room feels electric."
                : `Need at least ${MIN_TEAMS_TO_START} team${MIN_TEAMS_TO_START === 1 ? "" : "s"} and all ready (${teams.length} joined).`}
          </p>
          <Button
            type="button"
            className="mt-4 h-11 w-full text-base sm:w-auto sm:min-w-[220px]"
            disabled={!(canStart || canResume) || starting}
            onClick={() => void startAuction()}
          >
            {starting ? "Starting…" : canResume ? "Resume auction" : "Start live auction"}
          </Button>
        </div>
      ) : room.status === "paused" ? (
        <p className="text-center text-sm text-neutral-400">
          Auction paused — waiting for the host to resume.{" "}
          <Link href={`/room/${roomId}/auction`} className="text-blue-300 underline-offset-2 hover:underline">
            View live board
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-neutral-500">When the host starts, you’ll jump into the live block.</p>
      )}
    </div>
  );
}
