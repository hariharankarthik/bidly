"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { LeagueTab, LEAGUE_TABS } from "./LeagueTabNav";

function TabSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-xl bg-white/[0.04] px-4 py-5">
          <div className="h-3 w-1/3 rounded bg-white/[0.06]" />
          <div className="mt-2 h-2 w-1/2 rounded bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

/**
 * Client wrapper that shows/hides tab content based on the current ?tab= search param.
 * Shows a skeleton shimmer during transition, then fades in the new content.
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

  const [displayedTab, setDisplayedTab] = useState(activeTab);
  const [phase, setPhase] = useState<"visible" | "fading-out" | "loading">("visible");

  useEffect(() => {
    if (displayedTab !== activeTab) {
      // Phase 1: fade out old content
      setPhase("fading-out");
      const fadeOut = setTimeout(() => {
        // Phase 2: show skeleton
        setPhase("loading");
        const load = setTimeout(() => {
          // Phase 3: swap content and fade in
          setDisplayedTab(activeTab);
          setPhase("visible");
        }, 100);
        return () => clearTimeout(load);
      }, 120);
      return () => clearTimeout(fadeOut);
    }
  }, [activeTab, displayedTab]);

  if (phase === "loading") {
    return <TabSkeleton />;
  }

  return (
    <div
      className={`transition-all duration-150 ease-in-out ${
        phase === "visible" ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
    >
      {children[displayedTab]}
    </div>
  );
}
