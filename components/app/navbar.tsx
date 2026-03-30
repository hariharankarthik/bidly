import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const navLink =
  "relative rounded-md px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-px after:origin-left after:scale-x-0 after:bg-emerald-400/80 after:transition-transform hover:after:scale-x-100";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-800/80 bg-neutral-950/75 backdrop-blur-md supports-[backdrop-filter]:bg-neutral-950/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-5">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2 text-lg font-bold tracking-tight text-white transition-colors hover:text-emerald-300"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/25 to-amber-500/10 ring-1 ring-emerald-500/30 transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100">
            <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden />
          </span>
          <span>
            Auction<span className="text-emerald-400">Arena</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/dashboard" className={navLink}>
            Home
          </Link>
          <Link href="/practice" className={navLink}>
            Practice
          </Link>
          <Link href="/scoring" className={navLink}>
            Scoring
          </Link>
          <Link href="/profile" className={navLink}>
            Profile
          </Link>
          {user ? (
            <form action={signOutAction} className="ml-1">
              <Button type="submit" variant="ghost" size="sm" className="text-neutral-400 hover:text-white">
                Out
              </Button>
            </form>
          ) : (
            <Button asChild size="sm" variant="default" className="ml-1 shadow-emerald-900/30">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
