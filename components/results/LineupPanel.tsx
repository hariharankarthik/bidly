"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResultPlayer } from "./ResultsBody";

const MAX = 11;

export function LineupPanel({
  teamId,
  ownerId,
  myUserId,
  players,
  initialXi,
  captainPlayerId,
  viceCaptainPlayerId,
}: {
  teamId: string;
  ownerId: string;
  myUserId: string;
  players: ResultPlayer[];
  initialXi: string[];
  captainPlayerId: string | null;
  viceCaptainPlayerId: string | null;
}) {
  const isOwner = myUserId === ownerId;
  const [xi, setXi] = useState<Set<string>>(() => new Set(initialXi));
  const [c, setC] = useState<string | null>(captainPlayerId);
  const [vc, setVc] = useState<string | null>(viceCaptainPlayerId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setXi(new Set(initialXi));
    setC(captainPlayerId);
    setVc(viceCaptainPlayerId);
  }, [teamId, captainPlayerId, viceCaptainPlayerId, initialXi]);

  const squadIds = useMemo(() => new Set(players.map((p) => p.playerId)), [players]);

  if (!isOwner) return null;

  function toggle(pid: string) {
    setXi((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
        if (c === pid) setC(null);
        if (vc === pid) setVc(null);
      } else {
        if (next.size >= MAX) {
          toast.error(`At most ${MAX} starters`);
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
      const res = await fetch("/api/team/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          starting_xi_player_ids: [...xi],
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
    <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-4">
      <p className="text-sm font-medium text-emerald-200">Your fantasy lineup</p>
      <p className="mt-1 text-xs text-neutral-500">
        Pick up to {MAX} starters. Only they earn match points once set; bench players score 0 for the team. Captain 2×, vice-captain 1.5×.
        Leave empty to count the whole squad until you lock an XI.
      </p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {players.map((p) => {
          const on = xi.has(p.playerId);
          return (
            <li
              key={p.playerId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 px-2 py-2 text-sm"
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(p.playerId)}
                  className="h-4 w-4 rounded border-neutral-600 text-emerald-500"
                />
                <span>
                  {p.name} <span className="text-neutral-500">· {p.role}</span>
                </span>
              </label>
              {on ? (
                <span className="flex flex-wrap gap-2 text-xs">
                  <label className="flex items-center gap-1 text-neutral-400">
                    <input type="radio" name={`c-${teamId}`} checked={c === p.playerId} onChange={() => setC(p.playerId)} />
                    C
                  </label>
                  <label className="flex items-center gap-1 text-neutral-400">
                    <input type="radio" name={`vc-${teamId}`} checked={vc === p.playerId} onChange={() => setVc(p.playerId)} />
                    VC
                  </label>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save lineup"}
        </Button>
        <span className="self-center text-xs text-neutral-500">
          {xi.size}/{MAX} selected · squad {squadIds.size}
        </span>
      </div>
    </div>
  );
}
