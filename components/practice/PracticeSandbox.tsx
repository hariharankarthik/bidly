"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideAiBid, type AiDifficulty } from "@/lib/ai-bidder";
import { IPL_2026 } from "@/lib/sports/ipl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyLakhsToCr } from "@/lib/utils";

type Lot = { name: string; role: string; is_overseas: boolean; base: number };

const LOTS: Lot[] = [
  { name: "Demo Batter", role: "BAT", is_overseas: false, base: 100 },
  { name: "Demo Bowler", role: "BOWL", is_overseas: false, base: 80 },
  { name: "Demo All-rounder", role: "ALL", is_overseas: true, base: 120 },
];

type TeamSim = {
  id: string;
  label: string;
  remaining_purse: number;
  players_bought: number;
  overseas_count: number;
  roleCounts: Record<string, number>;
};

const INITIAL_TEAMS: TeamSim[] = [
  {
    id: "you",
    label: "You",
    remaining_purse: 8000,
    players_bought: 2,
    overseas_count: 1,
    roleCounts: { BAT: 1, BOWL: 1, ALL: 0, WK: 0 },
  },
  {
    id: "ai1",
    label: "AI North",
    remaining_purse: 8200,
    players_bought: 2,
    overseas_count: 0,
    roleCounts: { BAT: 2, BOWL: 0, ALL: 0, WK: 0 },
  },
  {
    id: "ai2",
    label: "AI South",
    remaining_purse: 7800,
    players_bought: 2,
    overseas_count: 2,
    roleCounts: { BAT: 0, BOWL: 2, ALL: 0, WK: 0 },
  },
];

export function PracticeSandbox() {
  const [difficulty, setDifficulty] = useState<AiDifficulty>("medium");
  const [lotIndex, setLotIndex] = useState(0);
  const [currentBid, setCurrentBid] = useState(LOTS[0]!.base);
  const [log, setLog] = useState<string[]>([]);
  const [autoRun, setAutoRun] = useState(false);
  const [simTeams] = useState<TeamSim[]>(() => JSON.parse(JSON.stringify(INITIAL_TEAMS)) as TeamSim[]);

  const lot = LOTS[lotIndex % LOTS.length]!;

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [line, ...prev].slice(0, 14));
  }, []);

  const runAiTick = useCallback(() => {
    setCurrentBid((cb) => {
      let next = cb;
      const lines: string[] = [];
      for (const t of simTeams) {
        if (t.id === "you") continue;
        const bid = decideAiBid(
          {
            team: t,
            player: { is_overseas: lot.is_overseas, role: lot.role },
            currentBid: next,
            basePrice: lot.base,
            config: IPL_2026,
            roleCounts: t.roleCounts,
          },
          difficulty,
        );
        if (bid) {
          lines.push(`${t.label} bid ${formatCurrencyLakhsToCr(bid)}`);
          next = bid;
        }
      }
      if (lines.length) setLog((prev) => [...lines, ...prev].slice(0, 14));
      return next;
    });
  }, [difficulty, lot.base, lot.is_overseas, lot.role, simTeams]);

  const runAiTickRef = useRef(runAiTick);
  runAiTickRef.current = runAiTick;

  useEffect(() => {
    if (!autoRun) return;
    const id = window.setInterval(() => runAiTickRef.current(), 2000);
    return () => window.clearInterval(id);
  }, [autoRun]);

  const resetLot = useCallback(() => {
    setCurrentBid(lot.base);
    pushLog(`--- New lot: ${lot.name} (${lot.role}) base ${formatCurrencyLakhsToCr(lot.base)}`);
  }, [lot, pushLog]);

  const humanBid = useCallback(() => {
    setCurrentBid((c) => {
      const next = c + 20;
      pushLog(`You bid ${formatCurrencyLakhsToCr(next)}`);
      return next;
    });
  }, [pushLog]);

  const nextLot = useCallback(() => {
    setLotIndex((i) => i + 1);
    pushLog("Lot cleared — next player.");
  }, [pushLog]);

  useEffect(() => {
    setCurrentBid(LOTS[lotIndex % LOTS.length]!.base);
  }, [lotIndex]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-neutral-800">
        <CardHeader>
          <CardTitle>Practice board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-300">
          <div className="flex flex-wrap gap-2">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <Button key={d} size="sm" variant={difficulty === d ? "default" : "secondary"} onClick={() => setDifficulty(d)}>
                {d}
              </Button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
            Auto AI bids every 2s (uses same engine as live validation)
          </label>
          <p className="text-lg font-semibold text-white">{lot.name}</p>
          <p>
            Current bid: <span className="text-blue-200">{formatCurrencyLakhsToCr(currentBid)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={humanBid}>You +20L</Button>
            <Button variant="secondary" onClick={runAiTick}>
              AI tick
            </Button>
            <Button variant="secondary" onClick={resetLot}>
              Reset lot
            </Button>
            <Button variant="secondary" onClick={nextLot}>
              Next demo player
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="border-neutral-800">
        <CardHeader>
          <CardTitle>Log</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 font-mono text-xs text-neutral-400">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
