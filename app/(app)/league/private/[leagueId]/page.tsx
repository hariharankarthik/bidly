import Link from "next/link";
import { Suspense } from "react";
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
import { InviteShareButtons } from "@/components/private-league/InviteShareButtons";
import { DeletePrivateLeagueButton } from "@/components/private-league/DeletePrivateLeagueButton";
import { StartLeagueButton } from "@/components/private-league/StartLeagueButton";
import { UnclaimTeamButton } from "@/components/private-league/UnclaimTeamButton";
import { ReadOnlyLineup } from "@/components/private-league/ReadOnlyLineup";
import { PrivateLineupPanel, type PrivateTeamPlayer } from "@/components/private-league/PrivateLineupPanel";
import { FreeAgentsList, type FreeAgent } from "@/components/private-league/FreeAgentsList";
import { LeagueTabNav } from "@/components/private-league/LeagueTabNav";
import { LeagueTabContent } from "@/components/private-league/LeagueTabContent";
import { TradesList, type TradeRecord } from "@/components/private-league/TradesList";
import { RosterWithTrade } from "@/components/private-league/RosterWithTrade";

export default async function PrivateLeaguePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league, error } = await supabase
    .from("fantasy_leagues")
    .select("id, name, host_id, league_kind, invite_code, sport_id, status")
    .eq("id", leagueId)
    .single();

  if (error || !league || league.league_kind !== "private") notFound();

  const cfg = getSportConfig(league.sport_id);
  const xiSize = cfg?.lineup?.xiSize ?? 11;
  const maxOverseasInXi = cfg?.lineup?.maxOverseasInXi ?? null;

  const { data: privateTeams } = await supabase
    .from("private_league_teams")
    .select("id, team_name, team_color, squad_player_ids, starting_xi_player_ids, captain_player_id, vice_captain_player_id, claimed_by, xi_confirmed_at")
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
  const claimedTeams = (privateTeams ?? []).filter((t) => Boolean(t.claimed_by));
  const xiReadyCount = claimedTeams.filter((t) => Boolean(t.xi_confirmed_at)).length;
  const allXiReady = claimedTeams.length > 0 && xiReadyCount === claimedTeams.length;

  const playerIds = [...new Set((privateTeams ?? []).flatMap((t) => (t.squad_player_ids as string[]) ?? []))];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("players").select("id, name, role, nationality, is_overseas").in("id", playerIds)
    : { data: [] as { id: string; name: string; role: string; nationality: string | null; is_overseas: boolean }[] };
  const playersById = new Map((playerRows ?? []).map((p) => [p.id, p]));

  // Free agents: players in the same sport not on any team's squad
  // Uses RPC (POST body) to avoid URL length limits with large exclusion lists
  const pickedIds = playerIds; // already deduplicated
  const { data: freeAgentRows } = await supabase.rpc("get_free_agents", {
    p_sport_id: league.sport_id,
    p_excluded_ids: pickedIds.length ? pickedIds : [],
  });
  const freeAgents: FreeAgent[] = ((freeAgentRows ?? []) as { id: string; name: string; role: string; nationality: string | null; is_overseas: boolean; base_price: number; ipl_team: string | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    nationality: p.nationality,
    is_overseas: p.is_overseas,
    base_price: p.base_price ?? 0,
    ipl_team: p.ipl_team ?? null,
  }));

  // Trades data
  const { data: tradeRows } = await supabase
    .from("private_league_trades")
    .select("id, league_id, proposer_team_id, recipient_team_id, offered_player_id, requested_player_id, status, created_at, resolved_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false });

  const trades: TradeRecord[] = (tradeRows ?? []) as TradeRecord[];

  // Collect all player IDs referenced in trades for name resolution
  const tradePlayerIds = [
    ...new Set(trades.flatMap((t) => [t.offered_player_id, t.requested_player_id])),
  ].filter((id) => !playersById.has(id));
  if (tradePlayerIds.length > 0) {
    const { data: tradePlayerRows } = await supabase
      .from("players")
      .select("id, name, role, nationality, is_overseas")
      .in("id", tradePlayerIds);
    for (const p of tradePlayerRows ?? []) {
      playersById.set(p.id, p);
    }
  }

  // Build lookups for TradesList
  const tradesPlayersById: Record<string, { id: string; name: string; role: string; nationality: string | null; is_overseas: boolean }> =
    Object.fromEntries([...playersById.entries()]);
  const tradesTeamsById: Record<string, { id: string; team_name: string; team_color: string }> =
    Object.fromEntries((privateTeams ?? []).map((t) => [t.id, { id: t.id, team_name: t.team_name, team_color: t.team_color ?? "#3B82F6" }]));

  // Pending trade player IDs (for disabling buttons)
  const pendingTrades = trades.filter((t) => t.status === "pending");
  const pendingPlayerIds = new Set(pendingTrades.flatMap((t) => [t.offered_player_id, t.requested_player_id]));
  const incomingPendingCount = pendingTrades.filter((t) => t.recipient_team_id === myClaimedTeamId).length;

  // My squad data for trade/pickup modals
  const myTeamData = myClaimedTeamId ? (privateTeams ?? []).find((t) => t.id === myClaimedTeamId) : null;
  const mySquadPlayers = myTeamData
    ? ((myTeamData.squad_player_ids as string[]) ?? [])
        .map((id) => playersById.get(id))
        .filter(Boolean)
        .map((p) => ({ id: p!.id, name: p!.name, role: p!.role, nationality: p!.nationality, is_overseas: p!.is_overseas }))
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title={league.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-1">
            Private league · invite code <span className="aa-invite-code text-violet-300">{league.invite_code}</span>
            <InviteShareButtons inviteCode={league.invite_code} />
          </span>
        }
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            {league.status === "draft" ? (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/25">Draft</span>
            ) : league.status === "active" ? (
              <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-300 ring-1 ring-green-500/25">Active</span>
            ) : league.status === "completed" ? (
              <span className="rounded-full bg-neutral-500/10 px-2 py-0.5 text-xs font-semibold text-neutral-300 ring-1 ring-neutral-500/25">Completed</span>
            ) : null}
            {teams.length ? (
              <span>
                <span className="text-neutral-400">{claimedCount}</span>/{teams.length} claimed
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            {isHost && league.status === "draft" ? <StartLeagueButton leagueId={leagueId} /> : null}
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

      {/* Tab navigation — Free Agents | Rosters | Leaderboard */}
      {privateTeams && privateTeams.length > 0 ? (
        <Suspense>
          <LeagueTabNav
            counts={{
              "free-agents": freeAgents.length,
              rosters: privateTeams.length,
              trades: incomingPendingCount > 0 ? incomingPendingCount : undefined,
            }}
          />
          <LeagueTabContent>
            {{
              "free-agents": (
                <section className="space-y-3">
                  <FreeAgentsList
                    players={freeAgents}
                    leagueId={leagueId}
                    leagueStatus={league.status}
                    mySquad={mySquadPlayers}
                    pendingPlayerIds={pendingPlayerIds}
                  />
                </section>
              ),
              rosters: (
                <section className="space-y-3">
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
                      const xiConfirmed = Boolean(t.xi_confirmed_at);
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
                                {league.status === "active" && claimedBy ? (
                                  xiConfirmed ? (
                                    <p className="text-xs text-green-400">XI set ✓</p>
                                  ) : (
                                    <p className="text-xs text-amber-400">XI not set</p>
                                  )
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isMine ? <span className="text-xs font-semibold text-blue-200">Your team</span> : null}
                              {isMine && league.status === "draft" ? <UnclaimTeamButton leagueId={leagueId} teamId={t.id} /> : null}
                              {canClaim ? <ClaimTeamButton leagueId={leagueId} teamId={t.id} /> : null}
                              <span className="text-xs text-neutral-500 group-open:text-neutral-300">Toggle</span>
                            </div>
                          </summary>

                          {/* Squad display: use RosterWithTrade for other teams in active leagues */}
                          {!isMine && league.status === "active" && myClaimedTeamId ? (
                            <RosterWithTrade
                              leagueId={leagueId}
                              teamId={t.id}
                              teamName={t.team_name}
                              squad={squad}
                              captainId={cId}
                              viceCaptainId={vcId}
                              mySquad={mySquadPlayers}
                              pendingPlayerIds={pendingPlayerIds}
                              canTrade={true}
                            />
                          ) : (
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
                          )}

                          {isMine && league.status === "active" ? (
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
                          ) : isMine && league.status === "draft" ? (
                            <p className="mt-4 text-sm text-neutral-400">Set your Playing XI once the host starts the league.</p>
                          ) : isMine && league.status === "completed" ? (
                            <p className="mt-4 text-sm text-neutral-400">League has ended.</p>
                          ) : null}

                          {!isMine && Array.isArray(t.starting_xi_player_ids) && (t.starting_xi_player_ids as string[]).length > 0 ? (
                            <ReadOnlyLineup
                              players={(t.starting_xi_player_ids as string[])
                                .map((id) => playersById.get(id))
                                .filter(Boolean)
                                .map((p) => ({ name: p!.name, role: p!.role, nationality: p!.nationality, isOverseas: p!.is_overseas }))}
                              captainName={cId ? (playersById.get(cId)?.name ?? null) : null}
                              viceCaptainName={vcId ? (playersById.get(vcId)?.name ?? null) : null}
                              xiSize={xiSize}
                            />
                          ) : null}
                        </details>
                      );
                    })}
                  </div>
                </section>
              ),
              trades: (
                <section className="space-y-3">
                  {league.status === "active" ? (
                    <TradesList
                      trades={trades}
                      myTeamId={myClaimedTeamId}
                      playersById={tradesPlayersById}
                      teamsById={tradesTeamsById}
                    />
                  ) : (
                    <p className="py-6 text-center text-sm text-neutral-500">
                      {league.status === "draft"
                        ? "Trading is available once the league is started."
                        : "Trading is closed — the league has ended."}
                    </p>
                  )}
                </section>
              ),
              leaderboard: (
                <LeagueClient leagueId={league.id} isHost={isHost} teams={teams} ownersByTeamId={ownersByTeamId} leagueStatus={league.status} myTeamId={myClaimedTeamId ?? undefined} />
              ),
            }}
          </LeagueTabContent>
        </Suspense>
      ) : null}

      {isHost ? (
        <details className="group rounded-2xl border border-red-500/15 bg-red-950/[0.12] p-5 ring-1 ring-red-500/10">
          <summary
            className="flex cursor-pointer list-none items-center justify-between gap-3 select-none"
            aria-label="Toggle danger zone"
          >
            <h2
              id="private-league-danger-heading"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300/65"
            >
              Danger zone
            </h2>
            <span className="text-xs text-neutral-500 group-open:text-neutral-300">Toggle</span>
          </summary>
          <div className="mt-3">
            <p className="text-xs text-neutral-500 sm:text-sm sm:whitespace-nowrap">
              Permanently delete this league, all imported rosters, scores, and the invite link. Members will lose access. This cannot be undone.
            </p>
            <div className="mt-4">
              <DeletePrivateLeagueButton leagueId={leagueId} leagueName={league.name} />
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
