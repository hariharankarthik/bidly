import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PrivateLeagueInviteLanding({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const code = inviteCode.trim().toUpperCase();
  const supabase = await createClient();

  const { data: league } = await supabase
    .from("fantasy_leagues")
    .select("id, league_kind")
    .eq("invite_code", code)
    .eq("league_kind", "private")
    .maybeSingle();

  if (!league) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="aa-display text-xl font-semibold text-white">League not found</h1>
        <p className="mt-2 text-sm text-neutral-500">Double-check the invite code.</p>
        <Link href="/dashboard" className="mt-6 inline-block text-violet-300 hover:underline">
          Dashboard
        </Link>
      </div>
    );
  }

  redirect(`/league/private/${league.id}`);
}
