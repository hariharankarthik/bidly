"use client";

import { useSearchParams, usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState, useCallback } from "react";

export const LEAGUE_TABS = ["free-agents", "rosters", "trades", "leaderboard"] as const;
export type LeagueTab = (typeof LEAGUE_TABS)[number];

const TAB_LABELS: Record<LeagueTab, string> = {
  "free-agents": "Free Agents",
  rosters: "Rosters",
  trades: "Trades",
  leaderboard: "Leaderboard",
};

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
 * Combined tab nav + content component.
 * Uses local state for instant tab switching (no server round-trip).
 * Updates URL via history.replaceState for deep-linking.
 */
export function LeagueTabs({
  children,
  counts,
}: {
  children: Record<(typeof LEAGUE_TABS)[number], ReactNode>;
  counts?: Partial<Record<LeagueTab, number>>;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const raw = searchParams.get("tab");
  const initialTab: LeagueTab = LEAGUE_TABS.includes(raw as LeagueTab)
    ? (raw as LeagueTab)
    : "free-agents";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [displayedTab, setDisplayedTab] = useState(initialTab);
  const [phase, setPhase] = useState<"visible" | "loading">("visible");

  const handleTabChange = useCallback(
    (tab: LeagueTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      // Update URL without triggering server navigation
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [activeTab, searchParams, pathname],
  );

  useEffect(() => {
    if (displayedTab !== activeTab) {
      // Show skeleton immediately
      setPhase("loading");
      const timer = setTimeout(() => {
        setDisplayedTab(activeTab);
        setPhase("visible");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, displayedTab]);

  return (
    <>
      {/* Tab navigation */}
      <nav
        className="inline-flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl"
        aria-label="League sections"
      >
        {LEAGUE_TABS.map((tab) => {
          const isActive = tab === activeTab;
          const count = counts?.[tab];
          return (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-violet-600/20 text-violet-100 shadow-sm shadow-violet-500/10 ring-1 ring-violet-500/25"
                  : "text-neutral-400 hover:bg-white/[0.07] hover:text-neutral-200 active:scale-[0.97]"
              }`}
            >
              {TAB_LABELS[tab]}
              {count != null ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none ${
                    isActive
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-white/5 text-neutral-500"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      {phase === "loading" ? (
        <TabSkeleton />
      ) : (
        <div className="animate-in fade-in duration-150">
          {children[displayedTab]}
        </div>
      )}
    </>
  );
}
