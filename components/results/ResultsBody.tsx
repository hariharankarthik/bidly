"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyLakhsToCr } from "@/lib/utils";

export type ResultPlayer = {
  resultId: string;
  playerId: string;
  name: string;
  role: string;
  isOverseas: boolean;
  soldPrice: number;
};

export type ResultTeamBlock = {
  teamId: string;
  teamName: string;
  teamColor: string;
  spend: number;
  avg: number;
  count: number;
  roles: Record<string, number>;
  overseas: number;
  players: ResultPlayer[];
};

export function ResultsBody({
  roomId,
  roomName,
  teams,
}: {
  roomId: string;
  roomName: string;
  teams: ResultTeamBlock[];
}) {
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const shareImage = useCallback(async () => {
    const node = shareRef.current;
    if (!node) return;
    setSharing(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `auctionarena-${roomId.slice(0, 8)}.png`;
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
          title: `${roomName} · AuctionArena`,
          text: "Our auction results are live.",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Share not available");
    }
  }, [roomName]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{roomName}</h1>
          <p className="text-sm text-neutral-500">Auction results</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={sharing} onClick={() => void shareImage()}>
            Share as image
          </Button>
          <Button type="button" variant="outline" onClick={() => void shareNative()}>
            Share link
          </Button>
          <Button asChild variant="outline">
            <Link href={`/room/${roomId}/league`}>Fantasy league</Link>
          </Button>
        </div>
      </div>

      {/* Capture region for html-to-image */}
      <div
        ref={shareRef}
        className="space-y-4 rounded-xl border border-neutral-700 bg-neutral-950 p-6 text-neutral-100"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <p className="text-xs uppercase tracking-widest text-emerald-400">AuctionArena</p>
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
                  <span className="font-medium">{p.name}</span>
                  <span className="text-neutral-500">
                    {" "}
                    · {p.role}
                    {p.isOverseas ? " · OS" : ""}
                  </span>
                  <div className="text-emerald-300">{formatCurrencyLakhsToCr(p.soldPrice)}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Button asChild variant="secondary">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
