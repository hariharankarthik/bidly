"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function UnclaimTeamButton({ leagueId, teamId }: { leagueId: string; teamId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unclaim() {
    const ok = window.confirm("Are you sure you want to unclaim this team?");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/leagues/private/unclaim-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: leagueId, team_id: teamId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to unclaim team");
      toast.success("Team unclaimed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unclaim team");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void unclaim()}>
      {busy ? "Unclaiming…" : "Unclaim"}
    </Button>
  );
}
