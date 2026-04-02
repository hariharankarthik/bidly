"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PlayerMeta } from "@/components/player/PlayerMeta";
import { FreeAgentPickupModal } from "./FreeAgentPickupModal";

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

const ROLE_ORDER: Record<string, number> = { WK: 0, BAT: 1, ALL: 2, BOWL: 3 };
const ROLE_FILTERS = ["All", "WK", "BAT", "ALL", "BOWL"] as const;
const MAX_SQUAD_SIZE = 15;

export function FreeAgentsList({
  players,
  leagueId,
  leagueStatus,
  mySquad,
  pendingPlayerIds,
}: {
  players: FreeAgent[];
  leagueId?: string;
  leagueStatus?: string;
  mySquad?: SquadPlayer[];
  pendingPlayerIds?: Set<string>;
}) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<string>("All");
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [pickupTarget, setPickupTarget] = useState<FreeAgent | null>(null);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);

  const isActive = leagueStatus === "active" && leagueId;
  const hasTeam = mySquad && mySquad.length > 0;
  const canPickUp = isActive && hasTeam;
  const squadSize = mySquad?.length ?? 0;
  const squadFull = squadSize >= MAX_SQUAD_SIZE;
  const canAddToSquad = isActive && hasTeam && !squadFull;

  const handleAddToSquad = async (playerId: string) => {
    if (!leagueId) return;
    setAddingPlayerId(playerId);
    try {
      const res = await fetch("/api/leagues/private/trade/add-to-squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: leagueId, player_id: playerId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setAddingPlayerId(null);
    }
  };

  const iplTeams = useMemo(() => {
    const teams = [...new Set(players.map((p) => p.ipl_team).filter(Boolean))] as string[];
    return teams.sort();
  }, [players]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
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
  }, [players, roleFilter, teamFilter, search]);

  // Group filtered players by IPL team for display
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
                      {p.base_price > 0 ? (
                        <span className="shrink-0 text-xs text-neutral-500">₹{p.base_price}L</span>
                      ) : null}
                      {isActive && hasTeam ? (
                        <>
                          <button
                            onClick={() => handleAddToSquad(p.id)}
                            disabled={squadFull || addingPlayerId === p.id || pendingPlayerIds?.has(p.id)}
                            title={squadFull ? `Squad full (${MAX_SQUAD_SIZE}/${MAX_SQUAD_SIZE})` : "Add to your squad"}
                            className="shrink-0 cursor-pointer rounded-lg bg-blue-600/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300 ring-1 ring-blue-500/25 transition hover:bg-blue-600/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {addingPlayerId === p.id ? "Adding…" : "Add"}
                          </button>
                          <button
                            onClick={() => setPickupTarget(p)}
                            disabled={pendingPlayerIds?.has(p.id)}
                            title="Drop one of your players and pick up this one"
                            className="shrink-0 cursor-pointer rounded-lg bg-green-600/20 px-2.5 py-1 text-[11px] font-semibold text-green-300 ring-1 ring-green-500/25 transition hover:bg-green-600/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Pick Up
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

      {pickupTarget && canPickUp ? (
        <FreeAgentPickupModal
          leagueId={leagueId!}
          targetPlayer={pickupTarget}
          mySquad={mySquad!}
          pendingPlayerIds={pendingPlayerIds ?? new Set()}
          onClose={() => setPickupTarget(null)}
        />
      ) : null}
    </div>
  );
}
