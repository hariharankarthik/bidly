"use client";

import { useState } from "react";
import { PlayerMeta } from "@/components/player/PlayerMeta";
import { TradeProposalModal } from "./TradeProposalModal";

interface SquadPlayer {
  id: string;
  name: string;
  role: string;
  nationality: string | null;
  is_overseas: boolean;
}

interface Props {
  leagueId: string;
  teamId: string;
  teamName: string;
  squad: SquadPlayer[];
  captainId: string | null;
  viceCaptainId: string | null;
  mySquad: SquadPlayer[];
  pendingPlayerIds: Set<string>;
  canTrade: boolean;
}

export function RosterWithTrade({
  leagueId,
  teamId,
  teamName,
  squad,
  captainId,
  viceCaptainId,
  mySquad,
  pendingPlayerIds,
  canTrade,
}: Props) {
  const [tradeTarget, setTradeTarget] = useState<SquadPlayer | null>(null);

  return (
    <>
      <div className="mt-4 grid gap-2">
        {squad
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => {
            const isC = captainId === p.id;
            const isVC = viceCaptainId === p.id;
            const isPending = pendingPlayerIds.has(p.id);

            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-neutral-950/35 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-neutral-100">
                    <PlayerMeta variant="inline" role={p.role} nationality={p.nationality} isOverseas={p.is_overseas} className="mr-2 align-middle" />
                    {p.name}{" "}
                    {isC ? <span className="text-blue-200">(C)</span> : isVC ? <span className="text-sky-200">(VC)</span> : null}
                  </p>
                </div>
                {canTrade ? (
                  <button
                    onClick={() => setTradeTarget(p)}
                    disabled={isPending}
                    className="shrink-0 cursor-pointer rounded-lg bg-violet-600/20 px-2.5 py-1 text-[11px] font-semibold text-violet-300 ring-1 ring-violet-500/25 transition hover:bg-violet-600/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPending ? "In Trade" : "Propose Trade"}
                  </button>
                ) : null}
              </div>
            );
          })}
        {squad.length === 0 ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-4">
            <p className="text-base font-medium text-white">No players imported</p>
            <p className="mt-1 text-sm text-amber-100/90">Ask the host to import a sheet.</p>
          </div>
        ) : null}
      </div>

      {tradeTarget ? (
        <TradeProposalModal
          leagueId={leagueId}
          recipientTeamId={teamId}
          recipientTeamName={teamName}
          targetPlayer={tradeTarget}
          mySquad={mySquad}
          pendingPlayerIds={pendingPlayerIds}
          onClose={() => setTradeTarget(null)}
        />
      ) : null}
    </>
  );
}
