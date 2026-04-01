import { redirect } from "next/navigation";

/** Legacy route — all invite-code resolution now lives at /join/[code]. */
export default async function PrivateLeagueInviteLanding({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  redirect(`/join/${encodeURIComponent(inviteCode.trim())}`);
}
