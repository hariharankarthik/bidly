"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { LeagueTab, LEAGUE_TABS } from "./LeagueTabNav";

/**
 * Client wrapper that shows/hides tab content based on the current ?tab= search param.
 * Each child section is keyed by tab name. Only the active tab renders.
 */
export function LeagueTabContent({
  children,
}: {
  children: Record<(typeof LEAGUE_TABS)[number], ReactNode>;
}) {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const activeTab: LeagueTab =
    raw === "rosters" || raw === "leaderboard" ? raw : "free-agents";

  return <>{children[activeTab]}</>;
}
