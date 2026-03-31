"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResultPlayer } from "./ResultsBody";
import { PlayerMeta } from "@/components/player/PlayerMeta";

export function LineupPanel({
  teamId,
  ownerId,
  myUserId,
  players,
  xiSize,
  maxOverseasInXi,
  initialXi,
  captainPlayerId,
  viceCaptainPlayerId,
}: {
  teamId: string;
  ownerId: string;
  myUserId: string;
  players: ResultPlayer[];
  xiSize: number;
  maxOverseasInXi: number | null;
  initialXi: string[];
  captainPlayerId: string | null;
  viceCaptainPlayerId: string | null;
}) {
  const isOwner = myUserId === ownerId;
  const [xi, setXi] = useState<Set<string>>(() => new Set(initialXi));
  const [c, setC] = useState<string | null>(captainPlayerId);
  const [vc, setVc] = useState<string | null>(viceCaptainPlayerId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{
    xi: string[];
    c: string | null;
    vc: string | null;
    at: number;
  } | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const squadSize = players.length;
    const canUseSavedXi = squadSize >= xiSize && Array.isArray(initialXi) && initialXi.length === xiSize;
    const nextXi = canUseSavedXi ? initialXi : [];
    setXi(new Set(nextXi));
    setC(canUseSavedXi && captainPlayerId && nextXi.includes(captainPlayerId) ? captainPlayerId : null);
    setVc(canUseSavedXi && viceCaptainPlayerId && nextXi.includes(viceCaptainPlayerId) ? viceCaptainPlayerId : null);
    setSaved(null);
    setLocked(false);
  }, [teamId, captainPlayerId, viceCaptainPlayerId, initialXi, players, xiSize]);

  const squadIds = useMemo(() => new Set(players.map((p) => p.playerId)), [players]);
  const nameById = useMemo(() => new Map(players.map((p) => [p.playerId, p.name])), [players]);
  const canSetFullXi = squadIds.size >= xiSize;
  const overseasSelected = useMemo(() => {
    let n = 0;
    for (const p of players) {
      if (p.isOverseas && xi.has(p.playerId)) n++;
    }
    return n;
  }, [players, xi]);
  /** Footer count: live while editing; frozen to last save while locked so it matches “Saved lineup”. */
  const displayedStarterCount = locked && saved ? saved.xi.length : xi.size;

  if (!isOwner) return null;

  function setCaptain(pid: string) {
    setC(pid);
    if (vc === pid) setVc(null);
  }

  function setViceCaptain(pid: string) {
    setVc(pid);
    if (c === pid) setC(null);
  }

  function toggle(pid: string) {
    setXi((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
        if (c === pid) setC(null);
        if (vc === pid) setVc(null);
      } else {
        if (!canSetFullXi) {
          toast.error(`You need ${xiSize} players on your squad to set a Starting XI`);
          return prev;
        }
        if (next.size >= xiSize) {
          toast.error(`Starting XI must have exactly ${xiSize} players`);
          return prev;
        }
        const pick = players.find((p) => p.playerId === pid);
        if (maxOverseasInXi != null && pick?.isOverseas && overseasSelected >= maxOverseasInXi) {
          toast.error(`At most ${maxOverseasInXi} overseas players allowed in Starting XI`);
          return prev;
        }
        next.add(pid);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const xiArr = [...xi];
      if (xiArr.length > 0) {
        if (!canSetFullXi) throw new Error(`You need ${xiSize} players on your squad to set a Starting XI`);
        if (xiArr.length !== xiSize) throw new Error(`Starting XI must have exactly ${xiSize} players`);
      }
      const res = await fetch("/api/team/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          starting_xi_player_ids: xiArr,
          captain_player_id: c,
          vice_captain_player_id: vc,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Lineup saved");
      setSaved({ xi: xiArr, c, vc, at: Date.now() });
      setLocked(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-950/15 to-white/5 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800/80 p-4">
        <div>
          <p className="text-sm font-semibold text-white">Starting XI</p>
          <p className="mt-1 text-xs text-neutral-400">
            You can set a Starting XI only once you have {xiSize} players. Starters count for points; bench scores 0.
            Captain 2× · Vice-captain 1.5×.
          </p>
          {!canSetFullXi ? (
            <p className="mt-1 text-xs text-amber-200/90">
              Your squad has {squadIds.size}. Buy {xiSize - squadIds.size} more to unlock XI selection.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200 ring-1 ring-blue-500/20">
            {displayedStarterCount}/{xiSize} selected
          </div>
          {maxOverseasInXi != null ? (
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                overseasSelected > maxOverseasInXi
                  ? "bg-red-500/10 text-red-200 ring-red-500/25"
                  : "bg-neutral-900/30 text-neutral-300 ring-white/10"
              }`}
              title={`Overseas in XI: ${overseasSelected}/${maxOverseasInXi}`}
            >
              ✈️ {overseasSelected}/{maxOverseasInXi}
            </div>
          ) : null}
        </div>
      </div>

      <ul className="max-h-72 space-y-2 overflow-y-auto p-4">
        {players.map((p) => {
          const on = xi.has(p.playerId);
          const isC = c === p.playerId;
          const isVC = vc === p.playerId;
          const disablePick = locked || (!canSetFullXi && !on);
          return (
            <li
              key={p.playerId}
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                on
                  ? "border-blue-500/25 bg-blue-950/15"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <label className={`flex flex-1 items-center gap-2 ${locked ? "cursor-default" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disablePick}
                  onChange={() => toggle(p.playerId)}
                  className="h-4 w-4 rounded border-neutral-600 text-blue-500"
                />
                <span>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <PlayerMeta variant="inline" role={p.role} nationality={(p as { nationality?: string | null }).nationality ?? null} isOverseas={p.isOverseas} />
                    <span className="font-medium text-neutral-100">{p.name}</span>
                  </span>
                </span>
              </label>
              {on ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCaptain(p.playerId)}
                    disabled={locked}
                    className={`rounded-full px-2 py-1 font-semibold ring-1 transition-colors ${
                      isC
                        ? "bg-blue-500/15 text-blue-200 ring-blue-500/30"
                        : "bg-neutral-900/40 text-neutral-400 ring-neutral-700/80 hover:text-neutral-200 disabled:hover:text-neutral-400"
                    }`}
                    title={isVC ? "Captain and vice-captain must be different" : "Set as captain"}
                  >
                    C · 2×
                  </button>
                  <button
                    type="button"
                    onClick={() => setViceCaptain(p.playerId)}
                    disabled={locked}
                    className={`rounded-full px-2 py-1 font-semibold ring-1 transition-colors ${
                      isVC
                        ? "bg-sky-500/15 text-sky-200 ring-sky-500/30"
                        : "bg-neutral-900/40 text-neutral-400 ring-neutral-700/80 hover:text-neutral-200 disabled:hover:text-neutral-400"
                    }`}
                    title={isC ? "Captain and vice-captain must be different" : "Set as vice-captain"}
                  >
                    VC · 1.5×
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800/80 p-4">
        <Button type="button" size="sm" disabled={saving || locked || !canSetFullXi} onClick={() => void save()}>
          {saving ? "Saving…" : "Save lineup"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={saving || !locked}
          onClick={() => setLocked(false)}
        >
          Edit lineup
        </Button>
        <span className="text-xs text-neutral-500">
          Starting XI:{" "}
          <span className="font-medium text-neutral-300">
            {displayedStarterCount}/{xiSize}
          </span>
          {squadIds.size > 0 ? (
            <span className="text-neutral-600"> · Auction squad {squadIds.size}</span>
          ) : null}
        </span>
        {c && vc ? (
          <span className="ml-auto text-xs text-neutral-500">
            Saved as: <span className="text-blue-200">C</span> + <span className="text-sky-200">VC</span>
          </span>
        ) : (
          <span className="ml-auto text-xs text-neutral-600">Pick C and VC from your starters (optional).</span>
        )}
      </div>

      {saved ? (
        <div className="border-t border-neutral-800/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Saved lineup</p>
          <p className="mt-2 text-sm text-neutral-200">
            {saved.xi.length ? (
              <span>
                XI:{" "}
                <span className="text-neutral-300">
                  {saved.xi
                    .map((id) => nameById.get(id) ?? id)
                    .sort((a, b) => a.localeCompare(b))
                    .join(" · ")}
                </span>
              </span>
            ) : (
              <span className="text-neutral-400">XI not set (full squad counts until you set one).</span>
            )}
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            Captain:{" "}
            <span className="font-medium text-blue-200">{saved.c ? nameById.get(saved.c) ?? saved.c : "—"}</span>
            <span className="mx-2 text-neutral-700">|</span>
            Vice-captain:{" "}
            <span className="font-medium text-sky-200">{saved.vc ? nameById.get(saved.vc) ?? saved.vc : "—"}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
