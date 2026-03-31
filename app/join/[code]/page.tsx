import { createClient } from "@/lib/supabase/server";
import { loginUrlWithNext } from "@/lib/safe-path";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const codeRaw = (raw ?? "").trim();
  const code = codeRaw.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Preserve the join target through OAuth.
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="aa-display text-2xl font-semibold text-white">Sign in to join</h1>
        <p className="text-sm text-neutral-500">We’ll send you right back after login.</p>
        <Button asChild size="lg" className="h-11">
          <Link href={loginUrlWithNext(`/join/${encodeURIComponent(code)}`)}>Continue</Link>
        </Button>
      </main>
    );
  }

  // Auction room invite?
  const { data: room } = await supabase
    .from("auction_rooms")
    .select("id")
    .in("invite_code", [code, codeRaw])
    .maybeSingle();
  if (room?.id) {
    redirect(`/room/${room.id}/lobby`);
  }

  // Private league invite?
  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("id, league_kind")
    .in("invite_code", [code, codeRaw])
    .maybeSingle();
  if (league?.id) {
    const dest = league.league_kind === "private" ? `/league/private/${league.id}` : `/league/${league.id}`;
    redirect(dest);
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

