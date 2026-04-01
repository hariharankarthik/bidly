"use client";

import { useCallback, useState } from "react";

type SyncArgs = {
  leagueId: string;
  matchId: string;
  matchDate: string;
  cricapiMatchId: string;
};

type SyncResponse = {
  error?: string;
  friendlyTitle?: string;
  friendlyMessage?: string;
  code?: string;
  retryable?: boolean;
  success?: boolean;
  performances_applied?: number;
  unmatched_names?: string[];
  mode?: string;
};

export class CricApiSyncError extends Error {
  public readonly friendlyTitle: string;
  public readonly friendlyMessage: string;
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(data: SyncResponse) {
    super(data.friendlyMessage ?? data.error ?? "Sync failed");
    this.name = "CricApiSyncError";
    this.friendlyTitle = data.friendlyTitle ?? "Something went wrong";
    this.friendlyMessage = data.friendlyMessage ?? data.error ?? "Sync failed";
    this.code = data.code ?? "UNKNOWN";
    this.retryable = data.retryable ?? true;
  }
}

/**
 * Calls the host-only API route which fetches CricAPI on the server (never exposes CRICAPI_KEY to the browser).
 */
export function useCricApiMatchScoring() {
  const [loading, setLoading] = useState(false);

  const syncFromCricApi = useCallback(async (args: SyncArgs) => {
    setLoading(true);
    try {
      const res = await fetch("/api/scores/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_id: args.leagueId,
          match_id: args.matchId,
          match_date: args.matchDate,
          cricapi_match_id: args.cricapiMatchId.trim(),
        }),
      });
      const data = (await res.json()) as SyncResponse;
      if (!res.ok) {
        throw new CricApiSyncError(data);
      }
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, syncFromCricApi };
}
