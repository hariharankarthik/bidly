"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ScoreRow = {
  id: string;
  league_id: string;
  team_id: string | null;
  private_team_id: string | null;
  /** Use for aggregation / charts (auction team id or private team id) */
  scoreboard_team_id: string;
  match_id: string;
  match_date: string;
  total_points: number;
  breakdown: Record<string, unknown>;
};

export function useLeaderboard(leagueId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) {
      setScores([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data } = await supabase.from("fantasy_scores").select("*").eq("league_id", leagueId);
      if (cancelled) return;
      const raw = (data ?? []) as Array<{
        id: string;
        league_id: string;
        team_id: string | null;
        private_team_id: string | null;
        match_id: string;
        match_date: string;
        total_points: number;
        breakdown: Record<string, unknown>;
      }>;
      setScores(
        raw.map((r) => ({
          ...r,
          scoreboard_team_id: (r.team_id ?? r.private_team_id) as string,
        })),
      );
      setLoading(false);
    }

    void load();

    const channel = supabase
      .channel(`scores:${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fantasy_scores", filter: `league_id=eq.${leagueId}` },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [leagueId, supabase]);

  return { scores, loading };
}
