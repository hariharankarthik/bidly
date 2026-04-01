"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, useRef, useEffect, useState } from "react";
import type { LeagueTab, LEAGUE_TABS } from "./LeagueTabNav";

/**
 * Client wrapper that shows/hides tab content based on the current ?tab= search param.
 * Applies a fade-out / fade-in transition when switching tabs.
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

  // Track which tab is actually displayed (lags behind activeTab during transition)
  const [displayedTab, setDisplayedTab] = useState(activeTab);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (displayedTab !== activeTab) {
      // Fade out old content
      setVisible(false);
      const id = setTimeout(() => {
        // Swap to new content, then fade in
        setDisplayedTab(activeTab);
        setVisible(true);
      }, 150);
      return () => clearTimeout(id);
    }
  }, [activeTab, displayedTab]);

  return (
    <div
      className={`transition-all duration-150 ease-in-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
    >
      {children[displayedTab]}
    </div>
  );
}
