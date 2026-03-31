import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeagueClient } from "@/components/league/LeagueClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSportConfig } from "@/lib/sports";
import type { LeagueTeamDisplay } from "@/lib/sports/types";
import { PlayerMeta } from "@/components/player/PlayerMeta";
import { ClaimTeamButton } from "@/components/private-league/ClaimTeamButton";
import { PrivateLineupPanel, type PrivateTeamPlayer } from "@/components/private-league/PrivateLineupPanel";

export default async function PrivateLeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league, error } = await supabase
    .from("fantasy_leagues")
    .select("id, name, host_id, league_kind, invite_code, sport_id")
    .eq("id", leagueId)
    .single();

  if (error || !league || league.league_kind !== "private") notFound();

  const cfg = getSportConfig(league.sport_id);
  const xiSize = cfg?.lineup?.xiSize ?? 11;
  const maxOverseasInXi = cfg?.lineup?.maxOverseasInXi ?? null;

  const { data: privateTeams } = await supabase
    .from("private_league_teams")
    .select("id, team_name, team_color, squad_player_ids, starting_xi_player_ids, captain_player_id, vice_captain_player_id, claimed_by")
    .eq("league_id", leagueId);

  const claimedByIds = [...new Set((privateTeams ?? []).map((t) => (t.claimed_by as string | null)).filter(Boolean))] as string[];
  const { data: profileRows } = claimedByIds.length
    ? await supabase.from("profiles").select("id, display_name, username").in("id", claimedByIds)
    : { data: [] as { id: string; display_name: string | null; username: string | null }[] };
  const ownerNameByUserId = new Map(
    (profileRows ?? []).map((p) => [p.id, (p.display_name ?? p.username ?? "Member").trim() || "Member"] as const),
  );

  const teams: LeagueTeamDisplay[] = (privateTeams ?? []).map((t) => ({
    id: t.id,
    team_name: t.team_name,
    team_color: t.team_color,
  }));

  const isHost = user?.id === league.host_id;
  const myClaimedTeamId = (privateTeams ?? []).find((t) => (t.claimed_by as string | null) === user?.id)?.id ?? null;
  const ownersByTeamId = Object.fromEntries(
    (privateTeams ?? [])
      .map((t) => [t.id, (t.claimed_by as string | null) ? ownerNameByUserId.get(t.claimed_by as string) ?? null : null] as const)
      .filter(([, v]) => Boolean(v)),
  ) as Record<string, string>;
  const claimedCount = (privateTeams ?? []).filter((t) => Boolean(t.claimed_by)).length;

  const playerIds = [...new Set((privateTeams ?? []).flatMap((t) => (t.squad_player_ids as string[]) ?? []))];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("players").select("id, name, role, nationality, is_overseas").in("id", playerIds)
    : { data: [] as { id: string; name: string; role: string; nationality: string | null; is_overseas: boolean }[] };
  const playersById = new Map((playerRows ?? []).map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title={league.name}
        subtitle={
          <>
            Private league · invite code <span className="aa-invite-code text-violet-300">{league.invite_code}</span>
          </>
        }
        meta={
          teams.length ? (
            <span>
              <span className="text-neutral-400">{claimedCount}</span>/{teams.length} claimed
            </span>
          ) : null
        }
        actions={
          <>
            {isHost ? (
              <Button asChild variant="secondary" className="border-violet-500/30 text-white">
                <Link href={`/league/private/${leagueId}/import`}>Import rosters</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </>
        }
      />
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

      {privateTeams && privateTeams.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Rosters</h2>
            <span className="text-xs text-neutral-600">{privateTeams.length} teams</span>
          </div>
          {!myClaimedTeamId ? (
            <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-4 text-sm text-neutral-300">
              <p className="font-medium text-white">Claim your team</p>
              <p className="mt-1 text-xs text-neutral-500">
                Pick the team you own in this league. Once claimed, you can set your Playing XI and C/VC.
              </p>
            </div>
          ) : null}
          <div className="grid gap-3">
            {privateTeams.map((t) => {
              const squad = ((t.squad_player_ids as string[]) ?? [])
                .map((id) => playersById.get(id))
                .filter(Boolean) as { id: string; name: string; role: string; nationality: string | null; is_overseas: boolean }[];
              const overseas = squad.filter((p) => p.is_overseas).length;
              const cId = t.captain_player_id as string | null;
              const vcId = t.vice_captain_player_id as string | null;
              const claimedBy = (t.claimed_by as string | null) ?? null;
              const isMine = Boolean(user?.id && claimedBy === user.id);
              const canClaim = Boolean(user?.id) && !claimedBy && !myClaimedTeamId;

              return (
                <details
                  key={t.id}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl open:border-blue-500/25"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white/10"
                        style={{ backgroundColor: t.team_color ?? "#3B82F6" }}
                        aria-hidden
                      />
                      <div>
                        <p className="font-medium text-white">{t.team_name}</p>
                        <p className="text-xs text-neutral-500">
                          {squad.length} players · {overseas} overseas
                          {claimedBy ? (
                            <>
                              {" "}
                              · <span className="text-neutral-400">Owner</span>{" "}
                              <span className="font-medium text-neutral-200">
                                {ownerNameByUserId.get(claimedBy) ?? "Member"}
                              </span>
                            </>
                          ) : (
                            <>
                              {" "}
                              · <span className="text-neutral-500">Unclaimed</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMine ? <span className="text-xs font-semibold text-blue-200">Your team</span> : null}
                      {canClaim ? <ClaimTeamButton leagueId={leagueId} teamId={t.id} /> : null}
                      <span className="text-xs text-neutral-500 group-open:text-neutral-300">Toggle</span>
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-2">
                    {squad
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((p) => {
                        const isC = cId === p.id;
                        const isVC = vcId === p.id;
                        return (
                          <div
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-neutral-950/35 px-3 py-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-neutral-100">
                                <PlayerMeta variant="inline" role={p.role} nationality={p.nationality} isOverseas={p.is_overseas} className="mr-2 align-middle" />
                                {p.name}{" "}
                                {isC ? <span className="text-blue-200">(C)</span> : isVC ? <span className="text-sky-200">(VC)</span> : null}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    {squad.length === 0 ? (
                      <Card className="border-amber-500/25 bg-amber-950/15">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">No players imported</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-amber-100/90">
                          {isHost ? "Import a sheet to populate this roster." : "Ask the host to import a sheet."}
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>

                  {isMine ? (
                    <PrivateLineupPanel
                      privateTeamId={t.id}
                      players={squad.map(
                        (p) =>
                          ({
                            playerId: p.id,
                            name: p.name,
                            role: p.role,
                            nationality: p.nationality,
                            isOverseas: p.is_overseas,
                          }) satisfies PrivateTeamPlayer,
                      )}
                      xiSize={xiSize}
                      maxOverseasInXi={maxOverseasInXi}
                      initialXi={Array.isArray(t.starting_xi_player_ids) ? (t.starting_xi_player_ids as string[]) : []}
                      captainPlayerId={t.captain_player_id as string | null}
                      viceCaptainPlayerId={t.vice_captain_player_id as string | null}
                    />
                  ) : null}
                </details>
              );
            })}
          </div>
        </section>
      ) : null}
      <LeagueClient leagueId={league.id} isHost={isHost} teams={teams} ownersByTeamId={ownersByTeamId} />
    </div>
  );
}
