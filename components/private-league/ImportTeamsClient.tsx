"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { detectDelimiter, parseDelimited } from "@/lib/csv/parse-delimited";

type Preview = {
  team_count: number;
  player_slots: number;
  unmatched_names: string[];
  warnings: string[];
};

export function ImportTeamsClient({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [playerCol, setPlayerCol] = useState("");
  const [teamCol, setTeamCol] = useState("");
  const [priceCol, setPriceCol] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  const headers = useMemo(() => {
    const t = text.trim();
    if (!t) return [] as string[];
    const d = detectDelimiter(t);
    const grid = parseDelimited(t, d);
    if (!grid.length) return [];
    return grid[0]!.filter((h) => h.length > 0);
  }, [text]);

  async function runPreview() {
    if (!teamCol) {
      toast.error("Pick the team column");
      return;
    }
    if (!playerCol) {
      toast.error("Pick the player name column");
      return;
    }
    if (!priceCol) {
      toast.error("Pick the price column");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/leagues/private/import-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_id: leagueId,
          sheet_text: text,
          dry_run: true,
          mapping: {
            player_name: playerCol,
            ...(teamCol.trim() ? { team: teamCol.trim() } : {}),
            ...(priceCol.trim() ? { price: priceCol.trim() } : {}),
          },
        }),
      });
      const data = (await res.json()) as Preview & { error?: string };
      if (!res.ok) {
        const warnings = (data as unknown as { warnings?: string[] }).warnings ?? [];
        if (warnings.length) {
          toast.message(`Warnings: ${warnings.slice(0, 3).join(" · ")}${warnings.length > 3 ? "…" : ""}`);
        }
        throw new Error(data.error || "Preview failed");
      }
      setPreview({
        team_count: data.team_count,
        player_slots: data.player_slots,
        unmatched_names: data.unmatched_names ?? [],
        warnings: data.warnings ?? [],
      });
      toast.success("Preview ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!teamCol) {
      toast.error("Pick the team column");
      return;
    }
    if (!playerCol) {
      toast.error("Pick the player name column");
      return;
    }
    if (!priceCol) {
      toast.error("Pick the price column");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/leagues/private/import-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_id: leagueId,
          sheet_text: text,
          mapping: {
            player_name: playerCol,
            ...(teamCol.trim() ? { team: teamCol.trim() } : {}),
            ...(priceCol.trim() ? { price: priceCol.trim() } : {}),
          },
        }),
      });
      const data = (await res.json()) as { error?: string; teams_imported?: number; warnings?: string[] };
      if (!res.ok) {
        const warnings = data.warnings ?? [];
        if (warnings.length) {
          toast.message(`Warnings: ${warnings.slice(0, 3).join(" · ")}${warnings.length > 3 ? "…" : ""}`);
        }
        throw new Error(data.error || "Import failed");
      }
      toast.success(`Imported ${data.teams_imported ?? 0} teams`);
      router.push(`/league/private/${leagueId}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="sheet">Paste CSV / TSV (header row + one row per player)</Label>
        <textarea
          id="sheet"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
          rows={12}
          placeholder={'e.g.\nTeam,Player,Price\nMumbai Indians,Rohit Sharma,10.00 Cr\nMumbai Indians,R. Sai Kishore,50 L'}
          className="w-full resize-y rounded-lg border border-white/10 bg-neutral-950/70 px-3 py-2 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        />
        <p className="text-xs text-neutral-500">
          Excel: Save As CSV. Sheets: copy range (tabs work). Player names should be full names (e.g. &ldquo;Rohit Sharma&rdquo;) to avoid ambiguity.
        </p>
      </div>

      {headers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Team column</Label>
            <select
              value={teamCol}
              onChange={(e) => setTeamCol(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-950/70 px-2 py-2 text-sm"
            >
              <option value="">Select…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Player column</Label>
            <select
              value={playerCol}
              onChange={(e) => setPlayerCol(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-950/70 px-2 py-2 text-sm"
            >
              <option value="">Select…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Price column</Label>
            <select
              value={priceCol}
              onChange={(e) => setPriceCol(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-950/70 px-2 py-2 text-sm"
            >
              <option value="">Select…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !text.trim() || !teamCol || !playerCol || !priceCol}
          onClick={() => void runPreview()}
        >
          Preview match
        </Button>
        <Button
          type="button"
          disabled={busy || !text.trim() || !teamCol || !playerCol || !priceCol}
          onClick={() => void runImport()}
          className="bg-gradient-to-r from-blue-600 to-blue-500 text-white"
        >
          Import teams
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(`/league/private/${leagueId}`)}>
          Skip to league
        </Button>
      </div>

      {preview ? (
        <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-4 text-sm">
          <p className="font-medium text-neutral-200">
            {preview.team_count} teams · {preview.player_slots} roster slots matched
          </p>
          {preview.unmatched_names.length ? (
            <p className="mt-2 text-amber-200/90">
              Unmatched ({preview.unmatched_names.length}): {preview.unmatched_names.slice(0, 12).join(", ")}
              {preview.unmatched_names.length > 12 ? "…" : ""}
            </p>
          ) : null}
          {preview.warnings.length ? (
            <ul className="mt-2 list-inside list-disc text-neutral-400">
              {preview.warnings.slice(0, 8).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
