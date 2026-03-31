"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

export function JoinInline({
  initialCode = "",
}: {
  initialCode?: string;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(initialCode);
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);

  async function join() {
    if (!code.trim() || !teamName.trim()) {
      toast.error("Invite code and team name required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code.trim(), team_name: teamName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Join failed");
      toast.success("Joined room");
      setOpen(false);
      router.push(`/room/${data.room_id}/lobby`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Join failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="lg" className="h-11 px-6 font-semibold" onClick={() => setOpen(true)}>
        Join with code
      </Button>
    );
  }

  return (
    <div className="mt-4 w-full max-w-sm mx-auto rounded-xl border border-white/10 bg-neutral-950/60 p-4 text-left">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-200">Join with invite code</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="code">Invite code</Label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC12X" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tname">Team name</Label>
          <Input id="tname" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Super Kings FC" />
        </div>
        <Button className="w-full" disabled={loading} onClick={join}>
          Join
        </Button>
      </div>
    </div>
  );
}
