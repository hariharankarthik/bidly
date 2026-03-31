import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportTeamsClient } from "@/components/private-league/ImportTeamsClient";

export default async function PrivateLeagueImportPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league, error } = await supabase
    .from("fantasy_leagues")
    .select("id, name, host_id, league_kind")
    .eq("id", leagueId)
    .single();

  if (error || !league || league.league_kind !== "private") notFound();
  if (!user || user.id !== league.host_id) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-neutral-400">
        <p>Only the league host can import rosters.</p>
        <Link href={`/league/private/${leagueId}`} className="mt-4 inline-block text-violet-300 hover:underline">
          Open league
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="aa-display text-2xl font-bold text-white">Import teams · {league.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">Map columns once — names are fuzzy-matched to your sport player list.</p>
      </div>
      <ImportTeamsClient leagueId={leagueId} />
    </div>
  );
}
