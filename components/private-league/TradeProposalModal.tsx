"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerMeta } from "@/components/player/PlayerMeta";

interface SquadPlayer {
  id: string;
  name: string;
  role: string;
  nationality: string | null;
  is_overseas: boolean;
}

interface Props {
  leagueId: string;
  recipientTeamId: string;
  recipientTeamName: string;
  targetPlayer: SquadPlayer;
  mySquad: SquadPlayer[];
  pendingPlayerIds: Set<string>;
  onClose: () => void;
}

export function TradeProposalModal({
  leagueId,
  recipientTeamId,
  recipientTeamName,
  targetPlayer,
  mySquad,
  pendingPlayerIds,
  onClose,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePropose = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/leagues/private/trade/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_id: leagueId,
          recipient_team_id: recipientTeamId,
          offered_player_id: selectedId,
          requested_player_id: targetPlayer.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to propose trade");
        setSubmitting(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">Propose Trade</h3>
        <p className="mt-1 text-sm text-neutral-400">
          You want <span className="font-medium text-violet-300">{targetPlayer.name}</span> from{" "}
          <span className="font-medium text-neutral-200">{recipientTeamName}</span>
        </p>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Select your player to offer
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-neutral-950/50 p-2">
            {mySquad.map((p) => {
              const isPending = pendingPlayerIds.has(p.id);
              const isSelected = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  disabled={isPending}
                  onClick={() => setSelectedId(isSelected ? null : p.id)}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "bg-violet-600/20 ring-1 ring-violet-500/30"
                      : isPending
                        ? "cursor-not-allowed opacity-40"
                        : "hover:bg-white/5"
                  }`}
                >
                  <PlayerMeta variant="inline" role={p.role} nationality={p.nationality} isOverseas={p.is_overseas} />
                  <span className={`truncate ${isSelected ? "text-violet-100" : "text-neutral-200"}`}>{p.name}</span>
                  {isPending ? <span className="ml-auto text-[10px] text-amber-400">In trade</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handlePropose}
            disabled={!selectedId || submitting}
            className="flex-1 cursor-pointer rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Proposing…" : "Propose Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
