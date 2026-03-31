import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-path";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  /** After OAuth, send people to the app home unless they had a concrete next path (e.g. dashboard + join code). */
  function postAuthRedirectTarget(raw: string | null): string {
    const next = safeNextPath(raw, "/dashboard");
    if (next === "/room/create" || next.startsWith("/room/create?")) {
      return "/dashboard";
    }
    return next;
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const dest = postAuthRedirectTarget(searchParams.get("next"));
      return NextResponse.redirect(new URL(dest, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}
