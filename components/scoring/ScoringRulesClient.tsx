"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

function Pt({ children, negative }: { children: React.ReactNode; negative?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
        negative
          ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/25"
          : "bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/25",
      )}
    >
      {children}
    </span>
  );
}

function Row({ label, pts, negative }: { label: string; pts: string; negative?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-neutral-800/80 py-3 last:border-0",
        negative && "rounded-lg bg-red-500/[0.06] px-2 -mx-2",
      )}
    >
      <span className="text-sm text-neutral-300">{label}</span>
      <Pt negative={negative}>{pts}</Pt>
    </div>
  );
}

function Section({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800/90 bg-gradient-to-b from-neutral-900/80 to-neutral-950/95 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
      >
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs font-medium text-sky-400/90">{subtitle}</p> : null}
        </div>
        <ChevronDown
          className={cn("mt-0.5 h-5 w-5 shrink-0 text-neutral-500 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-neutral-800/80 px-4 pb-4 pt-1">{children}</div> : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex gap-2 rounded-lg border border-sky-500/15 bg-sky-500/5 px-3 py-2 text-xs leading-relaxed text-sky-100/85">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400/80" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function ScoringRulesClient() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/90">Fantasy</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Scoring system</h1>
        <p className="text-sm text-neutral-400">
          How fantasy points are calculated in Bidly. Milestones use <strong className="text-neutral-200">highest tier only</strong> (e.g. a
          century awards the 100+ band, not 25/50/75 stacked).
        </p>
      </div>

      <div className="space-y-3">
        <Section title="Playing XI" defaultOpen>
          <Row label="Named in starting XI" pts="+4" />
        </Section>

        <Section title="Batting — base points" defaultOpen>
          <Row label="Each run scored" pts="+1" />
          <Row label="Four (boundary bonus)" pts="+4" />
          <Row label="Six bonus" pts="+6" />
          <Row label="Dismissed for 0 (duck)" pts="-2" negative />
          <Note>Duck penalty only if the batter is dismissed for 0 (not “not out” on 0).</Note>
        </Section>

        <Section title="Batting milestones" subtitle="Highest only">
          <Row label="25+ runs" pts="+4" />
          <Row label="50+ runs" pts="+8" />
          <Row label="75+ runs" pts="+12" />
          <Row label="100+ runs" pts="+16" />
          <Note>Only the highest applicable milestone is awarded (e.g. a century does not stack 25/50/75).</Note>
        </Section>

        <Section title="Strike rate bonus" subtitle="Min 10 balls faced OR 20 runs">
          <Row label="Above 190" pts="+8" />
          <Row label="170.01 – 190" pts="+6" />
          <Row label="150.01 – 170" pts="+4" />
          <Row label="130 – 150" pts="+2" />
          <Row label="70 – 100" pts="-2" negative />
          <Row label="60 – 70" pts="-4" negative />
          <Row label="50 – 59.99" pts="-6" negative />
          <Note>Strike-rate row applies only when eligibility (10 balls or 20 runs) is met.</Note>
        </Section>

        <Section title="Bowling — base">
          <Row label="Dot ball" pts="+2" />
          <Row label="Wicket (excl. run-out)" pts="+30" />
          <Row label="LBW / bowled bonus" pts="+8" />
          <Row label="Maiden over" pts="+12" />
        </Section>

        <Section title="Bowling milestones" subtitle="Highest only">
          <Row label="3 wickets" pts="+8" />
          <Row label="4 wickets" pts="+12" />
          <Row label="5 wickets" pts="+16" />
          <Note>Only the highest applicable milestone is awarded.</Note>
        </Section>

        <Section title="Economy rate" subtitle="Min 2 overs bowled">
          <Row label="Below 5.00" pts="+8" />
          <Row label="5.00 – 5.99" pts="+6" />
          <Row label="6.00 – 7.00" pts="+4" />
          <Row label="7.01 – 8.00" pts="+2" />
          <Row label="10.00 – 11.00" pts="-2" negative />
          <Row label="11.01 – 12.00" pts="-4" negative />
          <Row label="Above 12.00" pts="-6" negative />
          <Note>Economy bonus / penalty applies only with at least 2 overs bowled.</Note>
        </Section>

        <Section title="Fielding">
          <Row label="Catch" pts="+8" />
          <Row label="Stumping" pts="+12" />
          <Row label="Direct run out" pts="+12" />
          <Row label="Run out (thrower)" pts="+6" />
        </Section>

        <Section title="Special rules">
          <ul className="list-disc space-y-2 pl-4 text-sm text-neutral-400">
            <li>Run-out dismissals do not count as bowling wickets for the bowler.</li>
            <li>Overthrows count as batting runs; boundary bonuses do not apply to overthrow boundaries.</li>
            <li>Captain 2× / Vice-captain 1.5× apply after base points for players in your starting XI (set on **Results** after the auction).</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
