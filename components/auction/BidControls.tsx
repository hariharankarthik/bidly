"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { nextBidAmount } from "@/lib/auction-engine";
import { playSound } from "@/lib/sounds";
import { formatCurrencyLakhsToCr } from "@/lib/utils";
import { useAuctionUi } from "@/lib/store/auction-ui";

export function BidControls({
  roomId,
  teamId,
  currentBid,
  basePrice,
  disabled,
  increments,
}: {
  roomId: string;
  teamId: string | null;
  currentBid: number;
  basePrice: number;
  disabled: boolean;
  increments: number[];
}) {
  const bidIncrement = useAuctionUi((s) => s.bidIncrement);
  const setBidIncrement = useAuctionUi((s) => s.setBidIncrement);
  const [loading, setLoading] = useState(false);

  const amount = nextBidAmount(currentBid, bidIncrement, basePrice);

  async function placeBid() {
    if (!teamId) {
      toast.error("Join the room with a team first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, team_id: teamId, bid_amount: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bid failed");
      playSound("bid");
      toast.success(`Bid ${formatCurrencyLakhsToCr(amount)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bid failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-400">Increment</span>
        <select
          className="h-9 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-sm text-neutral-100"
          value={bidIncrement}
          onChange={(e) => setBidIncrement(Number(e.target.value))}
        >
          {increments.map((n) => (
            <option key={n} value={n}>
              {n}L
            </option>
          ))}
        </select>
      </div>
      <Button className="h-12 w-full text-base font-semibold shadow-lg shadow-blue-950/30" disabled={disabled || loading || !teamId} onClick={placeBid}>
        Bid {formatCurrencyLakhsToCr(amount)}
      </Button>
    </div>
  );
}
