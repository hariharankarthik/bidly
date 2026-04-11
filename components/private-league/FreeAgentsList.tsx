"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PlayerMeta } from "@/components/player/PlayerMeta";
import { isFreeAgentWindowUsed, getNextResetTime } from "@/lib/free-agent-window";

export interface FreeAgent {
  id: string;
  name: string;
  role: string;
  nationality: string | null;
  is_overseas: boolean;
  base_price: number;
  ipl_team: string | null;
}

interface SquadPlayer {
  id: string;
  name: string;
  role: string;
  nationality: string | null;
  is_overseas: boolean;
}

type StagedSwap = { drop: SquadPlayer | null; add: FreeAgent | null };

const ROLE_ORDER: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 };
const ROLE_FILTERS = ["All", "WK", "BAT", "ALL", "BOWL"] as const;
const MAX_SQUAD_SIZE = 15;

export function FreeAgentsList({
  players,
  leagueId,
  leagueStatus,
  mySquad,
  pendingPlayerIds,
  pointsByPlayerId,
  faWindowUsedAt,
  hasTeam,
}: {
  players: FreeAgent[];
  leagueId?: string;
  leagueStatus?: string;
  mySquad?: SquadPlayer[];
  pendingPlayerIds?: Set<string>;
  pointsByPlayerId?: Record<string, number>;
  faWindowUsedAt?: string | null;
  hasTeam?: boolean;
}) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<string>("All");
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  // Window state
  const [windowOpen, setWindowOpen] = useState(false);
  const [staged, setStaged] = useState<StagedSwap[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  // For the swap modal: which free agent the user wants to pick up
  const [swapTarget, setSwapTarget] = useState<FreeAgent | null>(null);

  const isActive = leagueStatus === "active" && leagueId;
  const windowUsed = isFreeAgentWindowUsed(faWindowUsedAt ?? null);
  const canOpenWindow = isActive && hasTeam && !windowUsed;

  // Effective squad after staged changes
  const effectiveSquad = useMemo(() => {
    if (!mySquad) return [];
    let squad = [...mySquad];
    for (const s of staged) {
      if (s.drop) squad = squad.filter((p) => p.id !== s.drop!.id);
      if (s.add) squad.push({ id: s.add.id, name: s.add.name, role: s.add.role, nationality: s.add.nationality, is_overseas: s.add.is_overseas });
    }
    return squad;
  }, [mySquad, staged]);

  // IDs staged for add/drop (to disable buttons)
  const stagedAddIds = useMemo(() => new Set(staged.map((s) => s.add?.id).filter(Boolean) as string[]), [staged]);
  const stagedDropIds = useMemo(() => new Set(staged.map((s) => s.drop?.id).filter(Boolean) as string[]), [staged]);

  // Effective free agents: original list minus staged adds, plus staged drops (simplified — just hide staged adds)
  const effectiveFreeAgents = useMemo(() => {
    return players.filter((p) => !stagedAddIds.has(p.id));
  }, [players, stagedAddIds]);

  const squadFull = effectiveSquad.length >= MAX_SQUAD_SIZE;

  const handleStageAdd = useCallback((fa: FreeAgent) => {
    if (effectiveSquad.length >= MAX_SQUAD_SIZE) return;
    setStaged((prev) => [...prev, { drop: null, add: fa }]);
  }, [effectiveSquad.length]);

  const handleStageSwap = useCallback((fa: FreeAgent, dropPlayer: SquadPlayer) => {
    setStaged((prev) => [...prev, { drop: dropPlayer, add: fa }]);
    setSwapTarget(null);
  }, []);

  const handleUnstage = useCallback((index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDiscard = useCallback(() => {
    setStaged([]);
    setWindowOpen(false);
    setCommitError(null);
    setSwapTarget(null);
  }, []);

  const handleCommit = async () => {
    if (!leagueId || staged.length === 0) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const changes = staged.map((s) => ({
        drop: s.drop?.id ?? null,
        add: s.add?.id ?? null,
      }));
      const res = await fetch("/api/leagues/private/free-agent-window/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: leagueId, changes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommitError(data.error ?? "Failed to commit changes");
        setCommitting(false);
        return;
      }
      setStaged([]);
      setWindowOpen(false);
      router.refresh();
    } catch {
      setCommitError("Network error");
    } finally {
      setCommitting(false);
    }
  };

  const iplTeams = useMemo(() => {
    const teams = [...new Set(effectiveFreeAgents.map((p) => p.ipl_team).filter(Boolean))] as string[];
    return teams.sort();
  }, [effectiveFreeAgents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return effectiveFreeAgents
      .filter(
        (p) =>
          (roleFilter === "All" || p.role === roleFilter) &&
          (teamFilter === "All" || p.ipl_team === teamFilter) &&
          (!q || p.name.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const teamA = a.ipl_team ?? "";
        const teamB = b.ipl_team ?? "";
        if (teamA !== teamB) return teamA.localeCompare(teamB);
        return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || b.base_price - a.base_price;
      });
  }, [effectiveFreeAgents, roleFilter, teamFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, FreeAgent[]>();
    for (const p of filtered) {
      const key = p.ipl_team ?? "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (players.length === 0) {
    return <p className="py-3 text-sm text-neutral-500">Every player in the pool has been picked.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Free Agent Window Controls */}
      {isActive && hasTeam ? (
        <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-4">
          {!windowOpen ? (
            windowUsed ? (
              <div className="space-y-1.5">
                <p className="text-sm text-neutral-300">
                  ✓ Free agent window used this week.
                </p>
                <p className="text-xs text-neutral-500">
                  Your next window opens <span className="text-neutral-400 font-medium">{getNextResetTime().pt} PT</span>
                  {" · "}<span className="text-neutral-400">{getNextResetTime().ist} IST</span>
                  {" · "}<span className="text-neutral-400">{getNextResetTime().et} ET</span>
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-200">Free Agent Window</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Open your weekly window to add or swap free agents. Changes are saved only when you confirm.
                  </p>
                </div>
                <button
                  onClick={() => setWindowOpen(true)}
                  className="shrink-0 cursor-pointer rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
                >
                  Open Window
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-green-300">🟢 Free Agent Window Open</p>
                <span className="text-xs text-neutral-500">{staged.length} change{staged.length !== 1 ? "s" : ""} staged</span>
              </div>

              {/* Staged changes list */}
              {staged.length > 0 ? (
                <div className="space-y-1 rounded-lg border border-white/10 bg-neutral-950/60 p-2">
                  {staged.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-neutral-300">
                        {s.drop && s.add ? (
                          <>
                            <span className="text-red-400">↓ {s.drop.name}</span>
                            {" → "}
                            <span className="text-green-400">↑ {s.add.name}</span>
                          </>
                        ) : s.add ? (
                          <span className="text-green-400">+ {s.add.name}</span>
                        ) : s.drop ? (
                          <span className="text-red-400">- {s.drop.name}</span>
                        ) : null}
                      </span>
                      <button
                        onClick={() => handleUnstage(i)}
                        className="cursor-pointer text-neutral-500 transition hover:text-red-400"
                        title="Remove this change"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {commitError ? <p className="text-sm text-red-400">{commitError}</p> : null}

              <div className="flex gap-2">
                <button
                  onClick={handleDiscard}
                  disabled={committing}
                  className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  onClick={handleCommit}
                  disabled={committing || staged.length === 0}
                  className="cursor-pointer rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {committing ? "Saving…" : "Close Window & Save Changes"}
                </button>
              </div>

              {staged.length > 0 ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 space-y-1">
                  <p className="text-[11px] text-amber-300/90 font-medium">
                    ⚠ Once you save, your free agent window will be used for this week.
                  </p>
                  <p className="text-[11px] text-amber-400/70">
                    Next window opens: <span className="font-medium text-amber-300/80">{getNextResetTime().pt} PT</span>
                    {" · "}{getNextResetTime().ist} IST
                    {" · "}{getNextResetTime().et} ET
                  </p>
                </div>
              ) : null}

              <p className="text-[11px] text-neutral-500">
                Changes are not saved until you click &quot;Close Window &amp; Save Changes&quot;. If you leave this page, all staged changes will be lost.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search by name…"
          aria-label="Search free agents by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48 rounded-lg border border-white/10 bg-neutral-950/50 px-3 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-violet-500/40 focus:outline-none"
        />
        <div className="flex gap-1" role="radiogroup" aria-label="Filter by role">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={roleFilter === r}
              onClick={() => setRoleFilter(r)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition ${
                roleFilter === r
                  ? "bg-violet-600/25 text-violet-200 ring-1 ring-violet-500/30"
                  : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
              }`}
            >
              {r === "All" ? "All" : r}
            </button>
          ))}
        </div>
        {iplTeams.length > 1 ? (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            aria-label="Filter by IPL team"
            className="h-8 cursor-pointer rounded-lg border border-white/10 bg-neutral-950/50 px-2 text-xs text-neutral-200 focus:border-violet-500/40 focus:outline-none"
          >
            <option value="All">All teams</option>
            {iplTeams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
        <span className="ml-auto text-xs text-neutral-500">
          {filtered.length} player{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Player list grouped by IPL team */}
      {filtered.length === 0 ? (
        <p className="py-2 text-sm text-neutral-500">No players match your filters.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([team, teamPlayers]) => (
            <div key={team}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                {team}{" "}
                <span className="text-neutral-600">({teamPlayers.length})</span>
              </h3>
              <div className="grid gap-1.5">
                {teamPlayers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-neutral-950/35 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <PlayerMeta variant="inline" role={p.role} nationality={p.nationality} isOverseas={p.is_overseas} className="shrink-0" />
                      <span className="truncate text-neutral-100">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(pointsByPlayerId?.[p.id] ?? 0) > 0 ? (
                        <span className="shrink-0 font-mono text-xs text-emerald-400">{Math.round(pointsByPlayerId?.[p.id] ?? 0)} pts</span>
                      ) : null}
                      {p.base_price > 0 ? (
                        <span className="shrink-0 text-xs text-neutral-500">₹{p.base_price}L</span>
                      ) : null}
                      {windowOpen && !stagedAddIds.has(p.id) ? (
                        <>
                          {!squadFull ? (
                            <button
                              onClick={() => handleStageAdd(p)}
                              title="Add to your squad"
                              className="shrink-0 cursor-pointer rounded-lg bg-blue-600/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300 ring-1 ring-blue-500/25 transition hover:bg-blue-600/30"
                            >
                              Add
                            </button>
                          ) : null}
                          <button
                            onClick={() => setSwapTarget(p)}
                            title="Swap one of your players for this one"
                            className="shrink-0 cursor-pointer rounded-lg bg-green-600/20 px-2.5 py-1 text-[11px] font-semibold text-green-300 ring-1 ring-green-500/25 transition hover:bg-green-600/30"
                          >
                            Swap
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Swap player selection modal */}
      {swapTarget && windowOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSwapTarget(null)}>
          <div
            className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">Swap for {swapTarget.name}</h3>
            <p className="mt-1 text-sm text-neutral-400">Select a player from your squad to drop:</p>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-neutral-950/50 p-2">
              {effectiveSquad
                .filter((p) => !stagedDropIds.has(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleStageSwap(swapTarget, p)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/5"
                  >
                    <PlayerMeta variant="inline" role={p.role} nationality={p.nationality} isOverseas={p.is_overseas} />
                    <span className="truncate text-neutral-200">{p.name}</span>
                  </button>
                ))}
            </div>
            <button
              onClick={() => setSwapTarget(null)}
              className="mt-4 w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
