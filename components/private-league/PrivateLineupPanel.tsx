"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlayerMeta } from "@/components/player/PlayerMeta";

const MAX = 11;
const MAX_OVERSEAS_XI_IPL = 4;

export type PrivateTeamPlayer = {
  playerId: string;
  name: string;
  role: string;
  nationality?: string | null;
  isOverseas: boolean;
};

export function PrivateLineupPanel({
  privateTeamId,
  players,
  initialXi,
  captainPlayerId,
  viceCaptainPlayerId,
}: {
  privateTeamId: string;
  players: PrivateTeamPlayer[];
  initialXi: string[];
  captainPlayerId: string | null;
  viceCaptainPlayerId: string | null;
}) {
  const [xi, setXi] = useState<Set<string>>(() => new Set(initialXi));
  const [c, setC] = useState<string | null>(captainPlayerId);
  const [vc, setVc] = useState<string | null>(viceCaptainPlayerId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setXi(new Set(initialXi));
    setC(captainPlayerId);
    setVc(viceCaptainPlayerId);
  }, [privateTeamId, captainPlayerId, viceCaptainPlayerId, initialXi]);

  const squadIds = useMemo(() => new Set(players.map((p) => p.playerId)), [players]);
  const maxStarters = squadIds.size ? Math.min(MAX, squadIds.size) : 0;
  const overseasSelected = useMemo(() => {
    let n = 0;
    for (const p of players) {
      if (p.isOverseas && xi.has(p.playerId)) n++;
    }
    return n;
  }, [players, xi]);

  function toggle(pid: string) {
    setXi((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
        if (c === pid) setC(null);
        if (vc === pid) setVc(null);
      } else {
        if (next.size >= maxStarters) {
          toast.error(`At most ${maxStarters} starter${maxStarters === 1 ? "" : "s"}`);
          return prev;
        }
        const pick = players.find((p) => p.playerId === pid);
        if (pick?.isOverseas && overseasSelected >= MAX_OVERSEAS_XI_IPL) {
          toast.error(`At most ${MAX_OVERSEAS_XI_IPL} overseas players allowed in Playing XI`);
          return prev;
        }
        next.add(pid);
      }
      return next;
    });
  }

  function setCaptain(pid: string) {
    setC(pid);
    if (vc === pid) setVc(null);
  }

  function setViceCaptain(pid: string) {
    setVc(pid);
    if (c === pid) setC(null);
  }

  async function save() {
    setSaving(true);
    try {
      const xiArr = [...xi];
      const res = await fetch("/api/private-team/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          private_team_id: privateTeamId,
          starting_xi_player_ids: xiArr,
          captain_player_id: c,
          vice_captain_player_id: vc,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Lineup saved");
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
          <p className="text-sm font-semibold text-white">Your Playing XI</p>
          <p className="mt-1 text-xs text-neutral-400">Choose up to {maxStarters || MAX}. Captain 2× · Vice-captain 1.5×.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200 ring-1 ring-blue-500/20">
            {xi.size}/{maxStarters || MAX} selected
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              overseasSelected > MAX_OVERSEAS_XI_IPL
                ? "bg-red-500/10 text-red-200 ring-red-500/25"
                : "bg-neutral-900/30 text-neutral-300 ring-white/10"
            }`}
            title={`Overseas in XI: ${overseasSelected}/${MAX_OVERSEAS_XI_IPL}`}
          >
            ✈️ {overseasSelected}/{MAX_OVERSEAS_XI_IPL}
          </div>
        </div>
      </div>

      <ul className="max-h-72 space-y-2 overflow-y-auto p-4">
        {players.map((p) => {
          const on = xi.has(p.playerId);
          const isC = c === p.playerId;
          const isVC = vc === p.playerId;
          return (
            <li
              key={p.playerId}
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                on ? "border-blue-500/25 bg-blue-950/15" : "border-white/10 bg-white/5"
              }`}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(p.playerId)}
                  className="h-4 w-4 cursor-pointer rounded border-neutral-600 text-blue-500"
                />
                <span className="inline-flex flex-wrap items-center gap-2">
                  <PlayerMeta variant="inline" role={p.role} nationality={p.nationality ?? null} isOverseas={p.isOverseas} />
                  <span className="font-medium text-neutral-100">{p.name}</span>
                </span>
              </label>
              {on ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCaptain(p.playerId)}
                    className={`cursor-pointer rounded-full px-2 py-1 font-semibold ring-1 transition-colors ${
                      isC ? "bg-blue-500/15 text-blue-200 ring-blue-500/30" : "bg-neutral-900/40 text-neutral-400 ring-neutral-700/80 hover:text-neutral-200"
                    }`}
                  >
                    C · 2×
                  </button>
                  <button
                    type="button"
                    onClick={() => setViceCaptain(p.playerId)}
                    className={`cursor-pointer rounded-full px-2 py-1 font-semibold ring-1 transition-colors ${
                      isVC ? "bg-sky-500/15 text-sky-200 ring-sky-500/30" : "bg-neutral-900/40 text-neutral-400 ring-neutral-700/80 hover:text-neutral-200"
                    }`}
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
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save lineup"}
        </Button>
        <span className="text-xs text-neutral-500">
          Playing XI: <span className="font-medium text-neutral-300">{xi.size}</span>
        </span>
      </div>
    </div>
  );
}

