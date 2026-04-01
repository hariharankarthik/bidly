import { createClient } from "@/lib/supabase/server";
import { loginUrlWithNext } from "@/lib/safe-path";
import { normalizeInviteCode, resolveJoinTarget } from "@/lib/join/resolve-invite-code";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const { code, codeRaw } = normalizeInviteCode(raw ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(loginUrlWithNext(`/join/${encodeURIComponent(code)}`));
  }

  const { data: room } = await supabase
    .from("auction_rooms")
    .select("id")
    .in("invite_code", [code, codeRaw])
    .maybeSingle();

  const { data: league } = room?.id
    ? { data: null }
    : await supabase
        .from("fantasy_leagues")
        .select("id, league_kind")
        .in("invite_code", [code, codeRaw])
        .maybeSingle();

  const target = resolveJoinTarget(room, league);

  if (target.kind !== "not-found") {
    redirect(target.url);
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="aa-display text-2xl font-semibold text-white">Invalid code</h1>
      <p className="text-sm text-neutral-500">
        <span className="font-mono text-neutral-300">{code}</span> wasn’t found. Check with your host and try again.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="secondary">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}

