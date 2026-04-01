"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StartLeagueButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    const ok = window.confirm(
      "Once started, scoring begins and unclaiming teams is no longer allowed. Continue?",
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/leagues/private/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: leagueId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to start league");
      toast.success("League started!");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start league");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="default" disabled={busy} onClick={() => void start()}>
      {busy ? "Starting…" : "▶ Start League"}
    </Button>
  );
}
