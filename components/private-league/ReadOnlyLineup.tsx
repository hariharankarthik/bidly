"use client";

import { PlayerMeta } from "@/components/player/PlayerMeta";

export function ReadOnlyLineup({
  players,
  captainName,
  viceCaptainName,
  xiSize,
}: {
  players: { name: string; role: string; nationality: string | null; isOverseas: boolean }[];
  captainName: string | null;
  viceCaptainName: string | null;
  xiSize: number;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-700/50 bg-neutral-950/40 backdrop-blur-xl">
      <div className="border-b border-neutral-800/80 p-4">
        <p className="text-sm font-semibold text-white">Starting XI</p>
        <p className="mt-1 text-xs text-neutral-400">
          {players.length}/{xiSize} selected
        </p>
      </div>
      <ul className="max-h-72 space-y-2 overflow-y-auto p-4">
        {players.map((p) => {
          const isC = captainName != null && p.name === captainName;
          const isVC = viceCaptainName != null && p.name === viceCaptainName;
          return (
            <li
              key={p.name}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            >
              <span className="inline-flex flex-wrap items-center gap-2">
                <PlayerMeta variant="inline" role={p.role} nationality={p.nationality} isOverseas={p.isOverseas} />
                <span className="font-medium text-neutral-100">{p.name}</span>
                {isC ? <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-200 ring-1 ring-blue-500/30">C</span> : null}
                {isVC ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-500/30">VC</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
