"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const SOCIAL = [
  { quote: "“Finally ran a clean mega auction with my office league.”", who: "Ahmed · Bangalore" },
  { quote: "“Realtime bids + purse math just worked.”", who: "Priya · Dubai" },
  { quote: "“We finished a full draft in one night.”", who: "Chris · London" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-950 to-emerald-950/30 text-neutral-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-16 sm:py-20">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6 text-center"
        >
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400/90">AuctionArena</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Run Your Own IPL Mega Auction with Friends.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-neutral-400">
            Real-time bidding, host tools, post-auction squads, and fantasy scoring — IPL first, built to add more sports.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login?next=/room/create">Create Free Auction</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login?next=/dashboard">Join a Room</Link>
            </Button>
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5 }}
          className="grid gap-6 sm:grid-cols-3"
        >
          {[
            { title: "Real-time bidding", body: "Supabase Realtime for rooms, teams, bids, and hammer moments." },
            { title: "Fantasy league", body: "Leaderboard, match breakdown, and charts — wire CricAPI when you want live stats." },
            { title: "AI practice", body: "Offline sandbox: easy random bids, medium role hunger, hard purse-aware value." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
              <h3 className="font-semibold text-emerald-300">{f.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{f.body}</p>
            </div>
          ))}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.45 }}
          className="rounded-2xl border border-neutral-800 bg-neutral-950/50 px-6 py-10"
        >
          <h2 className="text-center text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Social proof</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-neutral-400">
            Early squads are already running private IPL drafts — here is what hosts are saying.
          </p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {SOCIAL.map((s, i) => (
              <motion.li
                key={s.who}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className="rounded-xl border border-neutral-800/80 bg-neutral-950/80 p-4 text-left"
              >
                <p className="text-sm text-neutral-200">{s.quote}</p>
                <p className="mt-3 text-xs text-neutral-500">{s.who}</p>
              </motion.li>
            ))}
          </ul>
        </motion.section>
      </div>
    </main>
  );
}
