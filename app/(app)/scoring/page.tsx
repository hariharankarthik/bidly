import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginUrlWithNext } from "@/lib/safe-path";
import { ScoringRulesClient } from "@/components/scoring/ScoringRulesClient";

export const metadata: Metadata = {
  title: "Scoring system · Bidly",
  description: "How IPL-style fantasy points are calculated in Bidly.",
};

export default async function ScoringPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginUrlWithNext("/scoring"));

  return <ScoringRulesClient />;
}
