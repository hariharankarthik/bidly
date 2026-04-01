"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

export const LEAGUE_TABS = ["free-agents", "rosters", "leaderboard"] as const;
export type LeagueTab = (typeof LEAGUE_TABS)[number];

const TAB_LABELS: Record<LeagueTab, string> = {
  "free-agents": "Free Agents",
  rosters: "Rosters",
  leaderboard: "Leaderboard",
};

export function LeagueTabNav({
  counts,
}: {
  counts?: Partial<Record<LeagueTab, number>>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = searchParams.get("tab");
  const activeTab: LeagueTab = LEAGUE_TABS.includes(raw as LeagueTab) ? (raw as LeagueTab) : "free-agents";

  const setTab = useCallback(
    (tab: LeagueTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return (
    <nav className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-xl" aria-label="League sections">
      {LEAGUE_TABS.map((tab) => {
        const isActive = tab === activeTab;
        const count = counts?.[tab];
        return (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-violet-600/25 text-violet-200 ring-1 ring-violet-500/30"
                : "text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
            }`}
          >
            {TAB_LABELS[tab]}
            {count != null ? (
              <span className={`tabular-nums ${isActive ? "text-violet-300/70" : "text-neutral-600"}`}>
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
