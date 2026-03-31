import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeagueClient } from "@/components/league/LeagueClient";
import { Button } from "@/components/ui/button";
import type { LeagueTeamDisplay } from "@/lib/sports/types";

export default async function PrivateLeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league, error } = await supabase
    .from("fantasy_leagues")
    .select("id, name, host_id, league_kind, invite_code")
    .eq("id", leagueId)
    .single();

  if (error || !league || league.league_kind !== "private") notFound();

  const { data: privateTeams } = await supabase
    .from("private_league_teams")
    .select("id, team_name, team_color")
    .eq("league_id", leagueId);

  const teams: LeagueTeamDisplay[] = (privateTeams ?? []).map((t) => ({
    id: t.id,
    team_name: t.team_name,
    team_color: t.team_color,
  }));

  const isHost = user?.id === league.host_id;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="aa-display text-2xl font-semibold text-white">{league.name}</h1>
          <p className="text-sm text-neutral-500">
            Private league · invite code <span className="aa-invite-code text-violet-300">{league.invite_code}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHost ? (
            <Button asChild variant="secondary" className="border-violet-500/30 text-violet-200">
              <Link href={`/league/private/${leagueId}/import`}>Import rosters</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
      {teams.length === 0 ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">
          {isHost ? (
            <>
              No teams yet.{" "}
              <Link href={`/league/private/${leagueId}/import`} className="font-medium text-violet-300 underline underline-offset-2">
                Import a sheet
              </Link>{" "}
              to add squads.
            </>
          ) : (
            "The host hasn’t imported teams yet — check back soon."
          )}
        </div>
      ) : null}
      <LeagueClient leagueId={league.id} isHost={isHost} teams={teams} />
    </div>
  );
}
