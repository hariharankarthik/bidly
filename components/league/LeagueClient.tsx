"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useCricApiMatchScoring } from "@/hooks/useCricApiMatchScoring";
import type { AuctionTeam } from "@/lib/sports/types";
import { Leaderboard } from "./Leaderboard";
import { MatchBreakdown } from "./MatchBreakdown";
import { PointsChart } from "./PointsChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LeagueClient({
  leagueId,
  isHost,
  teams,
}: {
  roomId: string;
  leagueId: string | null;
  isHost: boolean;
  teams: AuctionTeam[];
}) {
  const router = useRouter();
  const { scores, loading } = useLeaderboard(leagueId);
  const [busy, setBusy] = useState(false);
  const { loading: cricBusy, syncFromCricApi } = useCricApiMatchScoring();
  const [cricId, setCricId] = useState("");

  async function mockMatch() {
    if (!leagueId) return;
    setBusy(true);
    try {
      const matchId = `M${Date.now()}`;
      const res = await fetch("/api/scores/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_id: leagueId,
          match_id: matchId,
          match_date: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Recorded ${data.updated} team rows`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!leagueId) {
    return (
      <p className="text-sm text-neutral-500">
        Fantasy league unlocks when the auction completes. Finish all lots, then open this page again.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-neutral-500">
        How points work:{" "}
        <Link href="/scoring" className="text-emerald-400 underline-offset-2 hover:underline">
          Scoring system
        </Link>
        . Host can still run mock rows for demos; real matches use the fantasy engine via <code className="rounded bg-neutral-800 px-1">performances</code> in the API.
      </p>
      {isHost ? (
        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <p className="text-xs font-medium text-neutral-400">Host tools</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void mockMatch()}>
              Add mock match scores
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor="cricapi-match-id" className="text-xs text-neutral-500">
                CricAPI match <code className="text-neutral-400">id</code> (from dashboard)
              </label>
              <Input
                id="cricapi-match-id"
                value={cricId}
                onChange={(e) => setCricId(e.target.value)}
                placeholder="e.g. match UUID from cricapi.com"
                className="font-mono text-sm"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || cricBusy || !cricId.trim()}
              onClick={() =>
                void (async () => {
                  if (!leagueId) return;
                  try {
                    const matchId = `cric-${Date.now()}`;
                    const data = await syncFromCricApi({
                      leagueId,
                      matchId,
                      matchDate: new Date().toISOString().slice(0, 10),
                      cricapiMatchId: cricId,
                    });
                    toast.success(`Synced · ${data?.performances_applied ?? 0} player rows applied`);
                    if (data?.unmatched_names?.length) {
                      toast.message(`Unmatched names: ${data.unmatched_names.slice(0, 5).join(", ")}${data.unmatched_names.length > 5 ? "…" : ""}`);
                    }
                    router.refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "CricAPI sync failed");
                  }
                })()
              }
            >
              {cricBusy ? "Fetching…" : "Fetch CricAPI & score"}
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            Set <code className="rounded bg-neutral-800 px-1">CRICAPI_KEY</code> on Vercel. Server calls{" "}
            <code className="rounded bg-neutral-800 px-1">api.cricapi.com</code> — key never ships to the browser.
          </p>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-neutral-500">Loading scores…</p> : null}
      <Leaderboard scores={scores} teams={teams} />
      <PointsChart scores={scores} teams={teams} />
      <MatchBreakdown scores={scores} teams={teams} />
    </div>
  );
}
