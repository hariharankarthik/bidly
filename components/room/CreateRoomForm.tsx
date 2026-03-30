"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IPL_2026 } from "@/lib/sports/ipl";
import { NFL_2026 } from "@/lib/sports/nfl";
import { getSportConfig } from "@/lib/sports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SPORT_OPTIONS = [
  { id: IPL_2026.id, label: IPL_2026.displayName, enabled: true },
  { id: NFL_2026.id, label: `${NFL_2026.displayName} (soon)`, enabled: false },
] as const;

function parseIncrements(raw: string, fallback: number[]): number[] {
  const parts = raw
    .split(/[\s,]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parts.length ? [...new Set(parts)].sort((a, b) => a - b) : fallback;
}

export function CreateRoomForm() {
  const router = useRouter();
  const [sportId, setSportId] = useState(IPL_2026.id);
  const [name, setName] = useState("");
  const [purse, setPurse] = useState(String(IPL_2026.purse.default));
  const [timer, setTimer] = useState(String(IPL_2026.timer.default));
  const [maxTeams, setMaxTeams] = useState(String(IPL_2026.roster.maxTeams));
  const [incrementsRaw, setIncrementsRaw] = useState(IPL_2026.bidIncrements.join(", "));
  const [loading, setLoading] = useState(false);

  const cfg = useMemo(() => getSportConfig(sportId), [sportId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    if (sportId === NFL_2026.id) {
      toast.error("NFL mode is coming soon — pick IPL for now.");
      return;
    }
    setLoading(true);
    try {
      const bid_increments = parseIncrements(incrementsRaw, cfg.bidIncrements);
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sport_id: sportId,
          purse: Number(purse),
          timer_seconds: Number(timer),
          max_teams: Number(maxTeams),
          bid_increments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Room created · code ${data.invite_code}`);
      router.push(`/room/${data.room_id}/lobby`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const purseHint = cfg ? `Min ${cfg.purse.min} · max ${cfg.purse.max} (lakhs or units)` : "";

  return (
    <Card className="mx-auto max-w-lg border-neutral-800">
      <CardHeader>
        <CardTitle>Create auction room</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="sport">Sport</Label>
            <select
              id="sport"
              className="flex h-10 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
              value={sportId}
              onChange={(e) => setSportId(e.target.value)}
            >
              {SPORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.enabled}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rname">Room name</Label>
            <Input id="rname" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Friday Night Auction" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purse">Purse ({cfg?.currency.unit ?? "units"})</Label>
            <Input id="purse" type="number" value={purse} onChange={(e) => setPurse(e.target.value)} />
            <p className="text-xs text-neutral-500">{purseHint}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timer">Timer (seconds)</Label>
            <Input id="timer" type="number" value={timer} onChange={(e) => setTimer(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxt">Max teams</Label>
            <Input id="maxt" type="number" value={maxTeams} onChange={(e) => setMaxTeams(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inc">Bid increments</Label>
            <Input
              id="inc"
              value={incrementsRaw}
              onChange={(e) => setIncrementsRaw(e.target.value)}
              placeholder="5, 10, 20, 25, 50, 100"
            />
            <p className="text-xs text-neutral-500">Comma-separated, in the same units as purse (e.g. lakhs for IPL).</p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            Create room
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
