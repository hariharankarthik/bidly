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

  async function post(url: string, body: object): Promise<Record<string, unknown> | null> {
    setLoading(url);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error ?? "Request failed"));
      toast.success("Updated");
      return data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
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
        onClick={() => void post("/api/auction/pause", { room_id: roomId, paused: true })}
      >
        Pause
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!!loading}
        onClick={() => void post("/api/auction/pause", { room_id: roomId, paused: false })}
      >
        Resume
      </Button>
      <Button
        size="sm"
        variant="outline"
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
        variant="outline"
        disabled={!!loading}
        onClick={() => void post("/api/auction/next-player", { room_id: roomId })}
      >
        Next
      </Button>
      <Button
        size="sm"
        disabled={!!loading}
        onClick={async () => {
          const data = await post("/api/auction/sold", { room_id: roomId });
          const fin = parseFinalize(data);
          if (fin) onLotFinalized?.(fin);
          if (fin?.completed) window.location.href = `/room/${roomId}/results`;
        }}
      >
        Sold / End lot
      </Button>
    </div>
  );
}
