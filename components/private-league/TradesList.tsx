"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerMeta } from "@/components/player/PlayerMeta";

export interface TradeRecord {
  id: string;
  league_id: string;
  proposer_team_id: string;
  recipient_team_id: string | null;
  offered_player_id: string;
  requested_player_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  resolved_at: string | null;
}

interface PlayerInfo {
  id: string;
  name: string;
  role: string;
  nationality: string | null;
  is_overseas: boolean;
}

interface TeamInfo {
  id: string;
  team_name: string;
  team_color: string;
}

interface Props {
  trades: TradeRecord[];
  myTeamId: string | null;
  playersById: Record<string, PlayerInfo>;
  teamsById: Record<string, TeamInfo>;
}

type Section = "incoming" | "outgoing" | "history";

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  accepted: { bg: "bg-green-500/10 ring-green-500/25", text: "text-green-300", label: "Accepted" },
  rejected: { bg: "bg-red-500/10 ring-red-500/25", text: "text-red-300", label: "Rejected" },
  cancelled: { bg: "bg-neutral-500/10 ring-neutral-500/25", text: "text-neutral-400", label: "Cancelled" },
  pending: { bg: "bg-amber-500/10 ring-amber-500/25", text: "text-amber-300", label: "Pending" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function TradesList({ trades, myTeamId, playersById, teamsById }: Props) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("incoming");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incoming = trades.filter(
    (t) => t.status === "pending" && t.recipient_team_id === myTeamId,
  );
  const outgoing = trades.filter(
    (t) => t.status === "pending" && t.proposer_team_id === myTeamId,
  );
  const history = trades.filter((t) => t.status !== "pending");

  const sections: { key: Section; label: string; count: number }[] = [
    { key: "incoming", label: "Incoming", count: incoming.length },
    { key: "outgoing", label: "Outgoing", count: outgoing.length },
    { key: "history", label: "History", count: history.length },
  ];

  const handleAction = async (tradeId: string, action: "accept" | "reject" | "cancel") => {
    setLoading(tradeId);
    setError(null);
    try {
      const endpoint = action === "cancel" ? "/api/leagues/private/trade/cancel" : "/api/leagues/private/trade/respond";
      const body = action === "cancel" ? { trade_id: tradeId } : { trade_id: tradeId, action };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        setLoading(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  };

  const renderPlayer = (id: string) => {
    const p = playersById[id];
    if (!p) return <span className="text-neutral-500">Unknown player</span>;
    return (
      <span className="inline-flex items-center gap-1.5">
        <PlayerMeta variant="inline" role={p.role} nationality={p.nationality} isOverseas={p.is_overseas} />
        <span className="font-medium text-neutral-100">{p.name}</span>
      </span>
    );
  };

  const renderTeam = (id: string | null) => {
    if (!id) return <span className="text-green-400">Free Agent Pool</span>;
    const t = teamsById[id];
    if (!t) return <span className="text-neutral-500">Unknown team</span>;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
          style={{ backgroundColor: t.team_color ?? "#3B82F6" }}
        />
        <span className="text-neutral-200">{t.team_name}</span>
      </span>
    );
  };

  const currentTrades = section === "incoming" ? incoming : section === "outgoing" ? outgoing : history;

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              section === s.key
                ? "bg-violet-600/20 text-violet-100 shadow-sm ring-1 ring-violet-500/25"
                : "text-neutral-400 hover:bg-white/[0.07] hover:text-neutral-200"
            }`}
          >
            {s.label}
            {s.count > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none ${
                  section === s.key && s.key !== "history"
                    ? "bg-violet-500/20 text-violet-300"
                    : "bg-white/5 text-neutral-500"
                }`}
              >
                {s.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {/* Trade cards */}
      {currentTrades.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          {section === "incoming"
            ? "No incoming trade proposals."
            : section === "outgoing"
              ? "No outgoing trade proposals."
              : "No trade history yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {currentTrades.map((t) => {
            const isPickup = !t.recipient_team_id;
            const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.pending;

            return (
              <div
                key={t.id}
                className="rounded-xl border border-white/10 bg-neutral-950/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    {isPickup ? (
                      <p className="text-sm">
                        <span className="text-neutral-400">Picked up </span>
                        {renderPlayer(t.requested_player_id)}
                        <span className="text-neutral-400">, dropped </span>
                        {renderPlayer(t.offered_player_id)}
                      </p>
                    ) : section === "incoming" ? (
                      <p className="text-sm">
                        {renderTeam(t.proposer_team_id)}
                        <span className="text-neutral-400"> offers </span>
                        {renderPlayer(t.offered_player_id)}
                        <span className="text-neutral-400"> for your </span>
                        {renderPlayer(t.requested_player_id)}
                      </p>
                    ) : section === "outgoing" ? (
                      <p className="text-sm">
                        <span className="text-neutral-400">You offered </span>
                        {renderPlayer(t.offered_player_id)}
                        <span className="text-neutral-400"> for </span>
                        {renderPlayer(t.requested_player_id)}
                        <span className="text-neutral-400"> from </span>
                        {renderTeam(t.recipient_team_id)}
                      </p>
                    ) : (
                      <p className="text-sm">
                        {renderTeam(t.proposer_team_id)}
                        <span className="text-neutral-400"> {isPickup ? "picked up" : "⇄"} </span>
                        {renderTeam(t.recipient_team_id)}
                        <span className="text-neutral-400"> · </span>
                        {renderPlayer(t.offered_player_id)}
                        <span className="text-neutral-400"> ↔ </span>
                        {renderPlayer(t.requested_player_id)}
                      </p>
                    )}
                    <p className="text-[11px] text-neutral-500">{timeAgo(t.created_at)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {t.status !== "pending" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    ) : null}

                    {section === "incoming" && t.status === "pending" ? (
                      <>
                        <button
                          onClick={() => handleAction(t.id, "accept")}
                          disabled={loading === t.id}
                          className="cursor-pointer rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleAction(t.id, "reject")}
                          disabled={loading === t.id}
                          className="cursor-pointer rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}

                    {section === "outgoing" && t.status === "pending" ? (
                      <button
                        onClick={() => handleAction(t.id, "cancel")}
                        disabled={loading === t.id}
                        className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300 transition hover:bg-white/10 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
