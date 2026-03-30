import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-path";
import type { SupabaseCookieToSet } from "@/lib/supabase/cookie-types";
import { resolveSupabasePublishableKey } from "@/lib/supabase/env";

const PROTECTED_PREFIXES = ["/dashboard", "/room", "/practice", "/profile", "/scoring"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = resolveSupabasePublishableKey();

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", safeNextPath(path, "/dashboard"));
    return NextResponse.redirect(redirectUrl);
  }

  if (path === "/login" && user) {
    const nextParam = request.nextUrl.searchParams.get("next");
    const next = safeNextPath(nextParam, "/dashboard");
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}
