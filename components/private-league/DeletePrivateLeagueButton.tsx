"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeletePrivateLeagueButton({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = window.confirm(
      `Permanently delete “${leagueName}”? All rosters, scores, and invite links for this league will be removed. This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/leagues/private/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league_id: leagueId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete league");
      toast.success("League deleted");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete league");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={busy}
      className="font-medium"
      onClick={() => void remove()}
    >
      {busy ? "Deleting…" : "Delete this league"}
    </Button>
  );
}
