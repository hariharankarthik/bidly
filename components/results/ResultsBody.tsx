"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LineupPanel } from "./LineupPanel";
import { formatCurrencyLakhsToCr } from "@/lib/utils";
import { PlayerMeta } from "@/components/player/PlayerMeta";
import { getSportConfig } from "@/lib/sports";

export type ResultPlayer = {
  resultId: string;
  playerId: string;
  name: string;
  role: string;
  isOverseas: boolean;
  soldPrice: number;
  nationality?: string | null;
};

export type ResultTeamBlock = {
  teamId: string;
  ownerId: string;
  teamName: string;
  teamColor: string;
  spend: number;
  avg: number;
  count: number;
  roles: Record<string, number>;
  overseas: number;
  players: ResultPlayer[];
  startingXiPlayerIds: string[];
  captainPlayerId: string | null;
  viceCaptainPlayerId: string | null;
};

export function ResultsBody({
  roomId,
  roomName,
  teams,
  myUserId,
  sportId,
}: {
  roomId: string;
  roomName: string;
  teams: ResultTeamBlock[];
  myUserId: string;
  sportId: string;
}) {
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const cfg = getSportConfig(sportId);
  const xiSize = cfg?.lineup?.xiSize ?? 11;
  const maxOverseasInXi = cfg?.lineup?.maxOverseasInXi ?? null;

  const shareImage = useCallback(async () => {
    const node = shareRef.current;
    if (!node) return;
    setSharing(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `bidly-${roomId.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Image downloaded — share it anywhere.");
    } catch {
      toast.error("Could not create image. Try a different browser.");
    } finally {
      setSharing(false);
    }
  }, [roomId]);

  const shareNative = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${roomName} · Bidly`,
          text: "Our auction results are live.",
          url,
        });
        toast.success("Share sheet opened");
        return true;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
        return true;
      }
      // Last-resort fallback for browsers that block clipboard APIs.
      window.prompt("Copy this link", url);
      toast.message("Copy the link from the prompt");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not share");
      return false;
    }
  }, [roomName]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title={roomName}
        subtitle="Auction results"
        actions={
          <>
            <Button type="button" variant="secondary" disabled={sharing} onClick={() => void shareImage()}>
              Share as image
            </Button>
            <Button type="button" variant="secondary" onClick={() => void shareNative()}>
              Share link
            </Button>
            <Button asChild variant="outline">
              <Link href={`/room/${roomId}/league`}>Fantasy league</Link>
            </Button>
          </>
        }
      />

      {/* Capture region for html-to-image */}
      <div
        ref={shareRef}
        className="space-y-4 rounded-xl border border-neutral-700 bg-neutral-950 p-6 text-neutral-100"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <p className="text-xs uppercase tracking-widest text-blue-300">Bidly</p>
        <h2 className="text-xl font-bold">{roomName}</h2>
        <p className="text-sm text-neutral-400">Squads & spend</p>
        {teams.map((t) => (
          <div key={t.teamId} className="border-t border-neutral-800 pt-3">
            <p className="font-semibold" style={{ color: t.teamColor }}>
              {t.teamName}
            </p>
            <p className="text-sm text-neutral-400">
              Spend {formatCurrencyLakhsToCr(t.spend)} · Avg {formatCurrencyLakhsToCr(Math.round(t.avg))} · Players{" "}
              {t.count} · Overseas {t.overseas}
            </p>
            <p className="text-xs text-neutral-500">
              Roles:{" "}
              {Object.entries(t.roles)
                .filter(([, n]) => n > 0)
                .map(([r, n]) => `${r}:${n}`)
                .join(" · ") || "—"}
            </p>
          </div>
        ))}
      </div>

      {teams.map((team) => (
        <Card key={team.teamId} className="border-neutral-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.teamColor }} />
              {team.teamName}
            </CardTitle>
            <p className="text-sm text-neutral-500">
              Spend {formatCurrencyLakhsToCr(team.spend)} · Avg {formatCurrencyLakhsToCr(Math.round(team.avg))} ·
              Players {team.count}
            </p>
            <p className="text-sm text-neutral-400">
              Overseas: <span className="text-neutral-200">{team.overseas}</span>
            </p>
            <p className="text-sm text-neutral-400">
              Roles:{" "}
              {Object.entries(team.roles)
                .filter(([, n]) => n > 0)
                .map(([r, n]) => (
                  <span key={r} className="mr-2">
                    {r}: <span className="text-neutral-100">{n}</span>
                  </span>
                ))}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {team.players.map((p) => (
                <li key={p.resultId} className="rounded-lg border border-neutral-800 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <PlayerMeta variant="inline" role={p.role} nationality={p.nationality ?? null} isOverseas={p.isOverseas} />
                        <span className="truncate font-medium">{p.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-blue-200">{formatCurrencyLakhsToCr(p.soldPrice)}</div>
                </li>
              ))}
            </ul>
            <LineupPanel
              teamId={team.teamId}
              ownerId={team.ownerId}
              myUserId={myUserId}
              players={team.players}
              xiSize={xiSize}
              maxOverseasInXi={maxOverseasInXi}
              initialXi={team.startingXiPlayerIds}
              captainPlayerId={team.captainPlayerId}
              viceCaptainPlayerId={team.viceCaptainPlayerId}
            />
          </CardContent>
        </Card>
      ))}

      <Button asChild variant="secondary">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
