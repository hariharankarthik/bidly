import Link from "next/link";
import { PrivateLeagueCreateForm } from "@/components/private-league/PrivateLeagueCreateForm";

export default function PrivateLeagueCreatePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-950/50 via-neutral-950/80 to-emerald-950/30 p-6 shadow-2xl shadow-violet-950/20">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300/90">Sheet leagues</p>
          <h1 className="aa-display mt-2 text-2xl font-bold text-white sm:text-3xl">Private fantasy league</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            No mega auction — import CSV or pasted columns, map player names to the IPL pool, and run the same scoring engine.
          </p>
        </div>
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 bg-neutral-950/40 p-6 backdrop-blur-sm">
        <PrivateLeagueCreateForm />
        <p className="mt-6 text-center text-xs text-neutral-500">
          <Link href="/dashboard" className="text-violet-300 hover:underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
