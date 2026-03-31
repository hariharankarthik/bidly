"use client";

import { EmojiBadge } from "@/components/ui/emoji-badge";
import { cn } from "@/lib/utils";

export type PlayerMetaInput = {
  role?: string | null;
  nationality?: string | null;
  isOverseas?: boolean | null;
};

function flagForNationality(nationality: string | null | undefined): string | null {
  const raw = (nationality ?? "").trim();
  if (!raw) return null;
  const n = raw.toLowerCase();
  const map: Record<string, string> = {
    india: "🇮🇳",
    australia: "🇦🇺",
    england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "south africa": "🇿🇦",
    "new zealand": "🇳🇿",
    afghanistan: "🇦🇫",
    "west indies": "🏝️",
    "sri lanka": "🇱🇰",
    bangladesh: "🇧🇩",
    ireland: "🇮🇪",
    scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    netherlands: "🇳🇱",
    "united states of america": "🇺🇸",
    nepal: "🇳🇵",
    zimbabwe: "🇿🇼",
    pakistan: "🇵🇰",
    "united arab emirates": "🇦🇪",
  };
  return map[n] ?? "🌍";
}

function emojiForRole(role: string | null | undefined): string | null {
  switch ((role ?? "").trim().toUpperCase()) {
    case "BAT":
      return "🏏";
    case "BOWL":
      return "🎯";
    case "ALL":
      return "🏏🎯";
    case "WK":
      return "🧤";
    default:
      return null;
  }
}

function roleLabel(role: string | null | undefined): string | null {
  switch ((role ?? "").trim().toUpperCase()) {
    case "BAT":
      return "Batter";
    case "BOWL":
      return "Bowler";
    case "ALL":
      return "All-rounder";
    case "WK":
      return "Wicketkeeper";
    default:
      return null;
  }
}

export function PlayerMeta({
  role,
  nationality,
  isOverseas,
  variant = "badge",
  className,
}: PlayerMetaInput & {
  variant?: "badge" | "inline";
  className?: string;
}) {
  const flag = flagForNationality(nationality);
  const flagLabel = (nationality ?? "").trim() || "Unknown country";
  const roleEmoji = emojiForRole(role);
  const rLabel = roleLabel(role);
  const showPlane = Boolean(isOverseas);

  const hasAny = Boolean(flag || roleEmoji || showPlane);
  if (!hasAny) return null;

  const wrapClass =
    variant === "inline"
      ? cn("inline-flex items-center gap-1.5 text-sm text-neutral-400", className)
      : cn(
          "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-neutral-200",
          className,
        );

  return (
    <span className={wrapClass}>
      {flag ? <EmojiBadge emoji={flag} label={flagLabel} /> : null}
      {roleEmoji && rLabel ? <EmojiBadge emoji={roleEmoji} label={rLabel} /> : null}
      {showPlane ? <EmojiBadge emoji="✈️" label="Overseas" /> : null}
    </span>
  );
}

