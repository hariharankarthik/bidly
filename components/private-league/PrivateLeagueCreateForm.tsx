"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IPL_2026 } from "@/lib/sports/ipl";

export function PrivateLeagueCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name your league");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/leagues/private/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sport_id: IPL_2026.id }),
      });
      const data = (await res.json()) as { league_id?: string; invite_code?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`League created · invite ${data.invite_code}`);
      router.push(`/league/private/${data.league_id}/import`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pl-name">League name</Label>
        <Input
          id="pl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sunday IPL crew"
          className="border-white/10 bg-neutral-950/60"
        />
      </div>
      <p className="text-xs text-neutral-500">
        Sport: <span className="text-neutral-300">{IPL_2026.displayName}</span> · no auction room — you’ll import squads from a sheet.
      </p>
      <Button type="submit" disabled={busy} className="bg-gradient-to-r from-violet-600 to-emerald-600 text-white hover:opacity-95">
        {busy ? "Creating…" : "Create private league"}
      </Button>
    </form>
  );
}
