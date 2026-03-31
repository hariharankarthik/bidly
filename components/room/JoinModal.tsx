"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

export function JoinInline({
  initialCode = "",
  createRoomHref = "/room/create",
}: {
  initialCode?: string;
  createRoomHref?: string;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(initialCode);
  const trimmed = code.trim().toUpperCase();

  function join() {
    if (!trimmed) return;
    setOpen(false);
    router.push(`/join/${encodeURIComponent(trimmed)}`);
  }

  if (!open) {
    return (
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={createRoomHref}>Create your first room</Link>
        </Button>
        <Button variant="secondary" size="lg" className="h-11 px-6 font-semibold" onClick={() => setOpen(true)}>
          Join with code
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto rounded-xl border border-white/10 bg-neutral-950/60 p-4 text-left">
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
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC12X"
            autoCapitalize="characters"
          />
        </div>
        <Button className="w-full" disabled={!trimmed} onClick={join}>
          Join
        </Button>
      </div>
    </div>
  );
}
