"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type FinalizeInfo = { wasSold: boolean; completed: boolean };

export function AuctionControls({
  roomId,
  onLotFinalized,
}: {
  roomId: string;
  onLotFinalized?: (info: FinalizeInfo) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function post(
    url: string,
    body: object,
    opts?: { successToast?: string },
  ): Promise<Record<string, unknown> | null> {
    setLoading(url);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error ?? "Request failed"));
      if (opts?.successToast) {
        toast.success(opts.successToast, { id: "host-auction" });
      }
      return data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed", { id: "host-auction-error" });
      return null;
    } finally {
      setLoading(null);
    }
  }

  function parseFinalize(data: Record<string, unknown> | null): FinalizeInfo | null {
    if (!data || typeof data.completed !== "boolean" || !("was_sold" in data)) return null;
    return { wasSold: Boolean(data.was_sold), completed: data.completed };
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={!!loading}
        onClick={() => void post("/api/auction/pause", { room_id: roomId, paused: true }, { successToast: "Auction paused" })}
      >
        Pause
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!!loading}
        onClick={() =>
          void post("/api/auction/pause", { room_id: roomId, paused: false }, { successToast: "Auction live" })
        }
      >
        Resume
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!!loading}
        onClick={async () => {
          const data = await post("/api/auction/unsold", { room_id: roomId });
          const fin = parseFinalize(data);
          if (fin) onLotFinalized?.(fin);
        }}
      >
        Unsold
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!!loading}
        onClick={() =>
          void post("/api/auction/next-player", { room_id: roomId }, { successToast: "Skipped to next player" })
        }
      >
        Next
      </Button>
      <Button
        size="sm"
        disabled={!!loading}
        title="Finalize immediately (ignores the timer). Sold if a high bidder exists, otherwise Unsold."
        onClick={async () => {
          const data = await post("/api/auction/finalize", { room_id: roomId, force: true });
          const fin = parseFinalize(data);
          if (fin) onLotFinalized?.(fin);
          if (fin?.completed) window.location.href = `/room/${roomId}/results`;
        }}
      >
        Finalize now
      </Button>
    </div>
  );
}
