"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { useAuctionRoom } from "@/hooks/useAuctionRoom";
import { createClient } from "@/lib/supabase/client";
import type { PlayerRow, RoomRuntimeConfig } from "@/lib/sports/types";
import { playSound } from "@/lib/sounds";
import { formatCurrencyLakhsToCr } from "@/lib/utils";
import { PlayerCard } from "./PlayerCard";
import { BidControls } from "./BidControls";
import { BidFeed } from "./BidFeed";
import { PurseTracker } from "./PurseTracker";
import { SquadTracker } from "./SquadTracker";
import { TimerDisplay } from "./Timer";
import { SoldOverlay } from "./SoldOverlay";
import { AuctionControls } from "./AuctionControls";
import { Badge } from "@/components/ui/badge";

export function AuctionRoomView({
  roomId,
  userId,
  myTeamId,
}: {
  roomId: string;
  userId: string;
  myTeamId: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { room, teams, bids, loading } = useAuctionRoom(roomId);
  const cfg = (room?.config ?? {}) as RoomRuntimeConfig;
  const duration = cfg.timerSeconds ?? 20;
  const increments = cfg.bidIncrements ?? [5, 10, 20, 25, 50, 100];
  const isHost = room?.host_id === userId;
  const reduceMotion = useReducedMotion();

  const [timeLeft, setTimeLeft] = useState(duration);
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [mySquad, setMySquad] = useState<PlayerRow[]>([]);
  const [soldOverlay, setSoldOverlay] = useState<{ open: boolean; label: string }>({ open: false, label: "" });
  const prevTick = useRef<number | null>(null);
  const prevTimeLeftForToast = useRef<number | null>(null);
  const finalizingRef = useRef(false);
  const prevAuctionStatusRef = useRef<string | undefined>(undefined);
  const prevPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    prevAuctionStatusRef.current = undefined;
    prevPlayerIdRef.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!isHost || !room) return;
    const s = room.status;
    prevAuctionStatusRef.current = s;
  }, [room?.status, isHost, room]);

  useEffect(() => {
    if (!isHost || !room) return;
    const pid = room.current_player_id;
    if (room.status !== "live") {
      if (pid) prevPlayerIdRef.current = pid;
      return;
    }
    if (!pid) return;
    // New lots get a fresh DB timer in `lot_ends_at` (no manual reset required)
    prevPlayerIdRef.current = pid;
  }, [room?.current_player_id, room?.status, isHost, room]);

  useEffect(() => {
    // Derived countdown from authoritative `auction_rooms.lot_ends_at`.
    if (!room || room.status !== "live") {
      setTimeLeft(duration);
      return;
    }
    if (!room.lot_ends_at) {
      setTimeLeft(duration);
      return;
    }

    const tick = () => {
      const endsMs = new Date(room.lot_ends_at as string).getTime();
      const now = Date.now();
      const next = Math.max(0, Math.ceil((endsMs - now) / 1000));
      setTimeLeft(next);
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [room?.lot_ends_at, room?.status, duration, room]);

  useEffect(() => {
    if (loading || !room) return;
    if (room.status === "completed") {
      router.replace(`/room/${roomId}/results`);
      return;
    }
    if (room.status === "lobby") {
      router.replace(`/room/${roomId}/lobby`);
    }
  }, [loading, room, roomId, router]);

  useEffect(() => {
    if (!room?.current_player_id) {
      setPlayer(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("players")
      .select("*")
      .eq("id", room.current_player_id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setPlayer((data as PlayerRow) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [room?.current_player_id, supabase]);

  useEffect(() => {
    if (!myTeamId) {
      setMySquad([]);
      return;
    }
    let cancelled = false;
    async function loadSquad() {
      const { data: results } = await supabase
        .from("auction_results")
        .select("player_id")
        .eq("room_id", roomId)
        .eq("team_id", myTeamId)
        .eq("is_unsold", false);
      const ids = (results ?? []).map((r) => r.player_id).filter(Boolean);
      if (!ids.length) {
        if (!cancelled) setMySquad([]);
        return;
      }
      const { data: plist } = await supabase.from("players").select("*").in("id", ids);
      if (!cancelled) setMySquad((plist as PlayerRow[]) ?? []);
    }
    void loadSquad();
    const ch = supabase
      .channel(`results:${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "auction_results", filter: `room_id=eq.${roomId}` },
        () => void loadSquad(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [myTeamId, roomId, supabase]);

  const currentBidderName = useMemo(() => {
    if (!room?.current_bidder_team_id) return "—";
    return teams.find((t) => t.id === room.current_bidder_team_id)?.team_name ?? "Team";
  }, [room?.current_bidder_team_id, teams]);

  useEffect(() => {
    const was = prevTimeLeftForToast.current;
    prevTimeLeftForToast.current = timeLeft;
    // Only on transition into 0 — not on every realtime room update while stuck at 0
    if (was !== null && was > 0 && timeLeft === 0 && isHost && room?.status === "live") {
      toast.message("Timer ended — finalizing lot.", { id: "auction-timer-zero" });
    }
  }, [timeLeft, isHost, room?.status]);

  useEffect(() => {
    if (!isHost || !room) return;
    if (room.status !== "live") return;
    if (!room.current_player_id) return;
    if (timeLeft !== 0) return;
    if (finalizingRef.current) return;
    finalizingRef.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/auction/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: roomId }),
        });
        const data = (await res.json()) as { error?: string; was_sold?: boolean; completed?: boolean };
        if (!res.ok) throw new Error(data.error || "Finalize failed");

        if (data.was_sold) playSound("gavel");
        setSoldOverlay({
          open: true,
          label: data.was_sold ? `SOLD · ${formatCurrencyLakhsToCr(room.current_bid)}` : "UNSOLD",
        });
        window.setTimeout(() => setSoldOverlay((s) => ({ ...s, open: false })), 1800);
        if (data.completed) window.location.href = `/room/${roomId}/results`;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Finalize failed");
      } finally {
        finalizingRef.current = false;
      }
    })();
  }, [timeLeft, isHost, room, roomId]);

  useEffect(() => {
    if (timeLeft <= 0) {
      prevTick.current = timeLeft;
      return;
    }
    const prev = prevTick.current;
    if (prev !== null) {
      if (prev > 10 && timeLeft <= 10) playSound("timerWarning");
      if (prev > 5 && timeLeft <= 5) playSound("timerWarning");
    }
    prevTick.current = timeLeft;
  }, [timeLeft]);

  if (loading || !room) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="aa-skeleton h-8 w-1/2 max-w-xs rounded-lg" />
        <div className="aa-skeleton h-48 w-full rounded-2xl" />
        <div className="aa-skeleton h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (room.status !== "live" && room.status !== "paused") {
    return (
      <div className="flex min-h-[30vh] items-center justify-center p-8 text-sm text-neutral-500">
        Taking you back to the lobby…
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-6xl gap-6 p-4 sm:p-6 lg:grid lg:grid-cols-[1.08fr_0.92fr] lg:gap-8">
      <SoldOverlay open={soldOverlay.open} label={soldOverlay.label} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400/90">On the block</p>
            <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">{room.name}</h1>
          </div>
          {room.status === "paused" ? (
            <Badge variant="subtle" className="bg-amber-950/40 px-3 py-1 text-xs text-amber-200 ring-1 ring-amber-500/40">
              PAUSED
            </Badge>
          ) : (
            <Badge variant="live" className="animate-pulse px-3 py-1 text-xs motion-reduce:animate-none">
              LIVE
            </Badge>
          )}
        </div>
        {room.status === "paused" ? (
          <p className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-sm text-amber-100/90">
            Bidding is frozen. Host: tap <strong>Resume</strong> below. You can also use the lobby — state is saved in the database.
          </p>
        ) : null}
        <PlayerCard player={player} />
        <div className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-950/40 to-neutral-950/90 p-5 ring-1 ring-blue-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Current bid</p>
          <motion.p
            key={room.current_bid}
            initial={reduceMotion ? undefined : { scale: 1.04, opacity: 0.85 }}
            animate={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
            transition={reduceMotion ? undefined : { type: "spring", stiffness: 380, damping: 22 }}
            className="mt-1 text-3xl font-bold tabular-nums text-blue-200 sm:text-4xl"
          >
            {formatCurrencyLakhsToCr(room.current_bid)}
          </motion.p>
          <p className="mt-2 text-sm text-neutral-400">
            Leading: <span className="font-medium text-neutral-200">{currentBidderName}</span>
          </p>
        </div>
        <TimerDisplay seconds={timeLeft} />
        <BidControls
          roomId={roomId}
          teamId={myTeamId}
          currentBid={room.current_bid}
          basePrice={player?.base_price ?? 0}
          disabled={room.status !== "live"}
          increments={increments}
        />
        {isHost ? (
          <div className="space-y-2">
            <p className="text-xs uppercase text-neutral-500">Host controls</p>
            {!room.current_bidder_team_id ? (
              <p className="text-xs text-neutral-500">
                No high bidder yet — when the timer ends this lot will go <strong className="font-medium text-neutral-300">UNSOLD</strong>. Host can also pass manually.
              </p>
            ) : null}
            <AuctionControls
              roomId={roomId}
              onLotFinalized={(info) => {
                setSoldOverlay({ open: true, label: info.wasSold ? `SOLD · ${formatCurrencyLakhsToCr(room.current_bid)}` : "UNSOLD" });
                if (info.wasSold) playSound("gavel");
                window.setTimeout(() => setSoldOverlay((s) => ({ ...s, open: false })), 1400);
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-8 space-y-4 lg:mt-0">
        <PurseTracker teams={teams} sportId={room.sport_id} />
        {room.sport_id && myTeamId ? (
          <SquadTracker sportId={room.sport_id} players={mySquad} teamLabel="Your squad" />
        ) : null}
        <BidFeed bids={bids} teams={teams} />
      </div>
    </div>
  );
}
