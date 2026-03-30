"use client";

import { useCallback, useState } from "react";

type SyncArgs = {
  leagueId: string;
  matchId: string;
  matchDate: string;
  cricapiMatchId: string;
};

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
      const data = (await res.json()) as {
        error?: string;
        success?: boolean;
        performances_applied?: number;
        unmatched_names?: string[];
        mode?: string;
      };
      if (!res.ok) throw new Error(data.error || "Sync failed");
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, syncFromCricApi };
}
