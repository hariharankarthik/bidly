"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

export const LEAGUE_TABS = ["free-agents", "rosters", "trades", "leaderboard"] as const;
export type LeagueTab = (typeof LEAGUE_TABS)[number];

const TAB_LABELS: Record<LeagueTab, string> = {
  "free-agents": "Free Agents",
  rosters: "Rosters",
  trades: "Trades",
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
    <nav className="inline-flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl" aria-label="League sections">
      {LEAGUE_TABS.map((tab) => {
        const isActive = tab === activeTab;
        const count = counts?.[tab];
        return (
          <button
            key={tab}
            onClick={() => setTab(tab)}
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
  );
}
