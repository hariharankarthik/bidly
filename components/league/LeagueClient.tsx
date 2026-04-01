"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useCricApiMatchScoring, CricApiSyncError } from "@/hooks/useCricApiMatchScoring";
import type { LeagueTeamDisplay } from "@/lib/sports/types";
import { Leaderboard } from "./Leaderboard";
import { MatchBreakdown } from "./MatchBreakdown";
import { PointsChart } from "./PointsChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LeagueClient({
  leagueId,
  isHost,
  teams,
  ownersByTeamId,
  title,
  subtitle,
  importHref,
}: {
  leagueId: string | null;
  isHost: boolean;
  teams: LeagueTeamDisplay[];
  ownersByTeamId?: Record<string, string>;
  /** Optional page heading (defaults to fantasy copy) */
  title?: string;
  subtitle?: string;
  /** Host link to roster import */
  importHref?: string;
}) {
  const router = useRouter();
  const { scores, loading } = useLeaderboard(leagueId);
  const [busy, setBusy] = useState(false);
  const { loading: cricBusy, syncFromCricApi } = useCricApiMatchScoring();
  const [cricId, setCricId] = useState("");
  const [cricMatchDate, setCricMatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rateLimited, setRateLimited] = useState(false);

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
        {subtitle ??
          "Fantasy league unlocks when the auction completes. Finish all lots, then open this page again."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {title ? (
        <div className="aa-card-interactive rounded-xl border border-white/10 bg-gradient-to-r from-blue-950/25 via-neutral-950/55 to-white/5 px-4 py-3">
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          {importHref && isHost ? (
            <p className="mt-1 text-xs text-neutral-400">
              <Link href={importHref} className="text-violet-300 underline-offset-2 hover:underline">
                Import or replace team rosters from CSV / sheet paste
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-neutral-500">
        How points work:{" "}
        <Link href="/scoring" className="text-blue-300 underline-offset-2 hover:underline">
          Scoring system
        </Link>
        .
        {isHost ? (
          <span className="block pt-1 text-neutral-500">As host, you can sync or demo scores using the tools below.</span>
        ) : null}
      </p>
      {scores.length === 0 && !loading ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-400">
          {isHost ? (
            <>
              No match scores yet. If match sync is configured, scores can appear automatically; you can also use <strong className="text-neutral-300">Host tools</strong>{" "}
              below to demo a match or sync when a fixture is available.
            </>
          ) : (
            <>No match scores yet. Check back after your host syncs a match.</>
          )}
        </div>
      ) : null}
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
                CricAPI match <code className="text-neutral-400">id</code> (from <code className="text-neutral-400">currentMatches</code> →{" "}
                <code className="text-neutral-400">data[].id</code>)
              </label>
              <Input
                id="cricapi-match-id"
                value={cricId}
                onChange={(e) => setCricId(e.target.value)}
                placeholder="55fe0f15-6eb0-4ad5-835b-5564be4f6a21"
                className="font-mono text-sm"
              />
            </div>
            <div className="min-w-[10rem] space-y-1">
              <label htmlFor="cricapi-match-date" className="text-xs text-neutral-500">
                Match date (for leaderboard / backfill)
              </label>
              <Input
                id="cricapi-match-date"
                type="date"
                value={cricMatchDate}
                onChange={(e) => setCricMatchDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || cricBusy || !cricId.trim() || rateLimited}
              onClick={() =>
                void (async () => {
                  if (!leagueId) return;
                  try {
                    const mid = cricId.trim();
                    const data = await syncFromCricApi({
                      leagueId,
                      matchId: mid,
                      matchDate: cricMatchDate.slice(0, 10),
                      cricapiMatchId: mid,
                    });
                    toast.success(`Synced · ${data?.performances_applied ?? 0} player rows applied`);
                    if (data?.unmatched_names?.length) {
                      toast.message(`Unmatched names: ${data.unmatched_names.slice(0, 5).join(", ")}${data.unmatched_names.length > 5 ? "…" : ""}`);
                    }
                    router.refresh();
                  } catch (e) {
                    if (e instanceof CricApiSyncError) {
                      toast.error(e.friendlyTitle, {
                        description: e.friendlyMessage,
                      });
                      if (e.code === "RATE_LIMIT") {
                        setRateLimited(true);
                      }
                    } else {
                      toast.error("Something went wrong", {
                        description: e instanceof Error ? e.message : "CricAPI sync failed",
                      });
                    }
                  }
                })()
              }
            >
              {cricBusy ? "Fetching…" : rateLimited ? "API limit reached" : "Fetch CricAPI & score"}
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            Set <code className="rounded bg-neutral-800 px-1">CRICAPI_KEY</code> on Vercel. Server calls{" "}
            <code className="rounded bg-neutral-800 px-1">api.cricapi.com</code> — key never ships to the browser. Use the
            same UUID as cron (<code className="rounded bg-neutral-800 px-1">match_id</code> in DB). For a past game, set
            match date to that day. If points look wrong, check Starting XI / C·VC and name matches in Supabase{" "}
            <code className="rounded bg-neutral-800 px-1">players</code> vs CricAPI scorecard names.
          </p>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-neutral-500">Loading scores…</p> : null}
      <Leaderboard scores={scores} teams={teams} ownersByTeamId={ownersByTeamId} />
      <PointsChart scores={scores} teams={teams} />
      <MatchBreakdown scores={scores} teams={teams} />
    </div>
  );
}
