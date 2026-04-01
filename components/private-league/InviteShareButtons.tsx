"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function InviteShareButtons({ inviteCode }: { inviteCode: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast.success("Copied!");
    } catch {
      toast.error("Failed to copy");
    }
  }

  async function share() {
    const url = `${window.location.origin}/join/${inviteCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my Bidly league",
          text: `Use invite code: ${inviteCode}`,
          url,
        });
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          await copy();
        }
      }
    } else {
      await copy();
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void copy()}>
        Copy
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void share()}>
        Share
      </Button>
    </>
  );
}
