"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  async function signUpEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Check your email to confirm, or sign in if already confirmed.");
  }

  async function signInGoogle() {
    setLoading(true);
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
    });
    setLoading(false);
    if (error) setMessage(error.message);
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#070708] p-5 sm:p-8 outline-none"
    >
      <div className="aa-hero-glow opacity-50" aria-hidden />
      <Card className="relative w-full max-w-md rounded-2xl border-blue-500/20 bg-neutral-950/90 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-md">
        <CardHeader className="space-y-3 text-center sm:text-left">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/25 to-amber-500/10 ring-1 ring-blue-500/25 sm:mx-0">
            <Sparkles className="h-5 w-5 text-blue-200" aria-hidden />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-white">Welcome in</CardTitle>
            <CardDescription className="mt-2 text-base text-neutral-400">
              Sign in and jump straight into your auction.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Button type="button" variant="secondary" className="h-11 w-full text-base" disabled={loading} onClick={signInGoogle}>
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="h-px flex-1 bg-neutral-800" aria-hidden />
            <span className="shrink-0">or use email</span>
            <span className="h-px flex-1 bg-neutral-800" aria-hidden />
          </div>
          <form className="space-y-4" onSubmit={signInEmail}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
            {message ? <p className="text-sm text-amber-400">{message}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" className="h-11 flex-1 text-base" disabled={loading}>
                Sign in
              </Button>
              <Button type="button" variant="secondary" className="h-11 flex-1 text-base" disabled={loading} onClick={signUpEmail}>
                Sign up
              </Button>
            </div>
          </form>
          <p className="text-center text-sm text-neutral-500">
            <Link href="/" className="font-medium text-blue-300 hover:text-blue-200 hover:underline">
              ← Back to home
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
