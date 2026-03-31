#!/usr/bin/env bash
# Create GitHub issues from the Mar 2026 UI/UX audit (Bidly).
#
# Prerequisites:
#   brew install gh    # if needed
#   gh auth login
#
# Usage (from repo root):
#   ./scripts/create-github-audit-issues.sh
#
# Optional: create labels in the repo UI first: bug, P0, P1, P2, P3, navigation, auth, ux, enhancement, data, api, infra, import, polish, mobile, onboarding, landing, rooms, profile, practice, error-handling
# This script does not attach labels (GitHub errors if a label does not exist).

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login"
  exit 1
fi

mkbody() {
  mktemp "${TMPDIR:-/tmp}/bidly-issue.XXXXXX"
}

one() {
  local title="$1"
  local f
  f=$(mkbody)
  cat >"$f"
  gh issue create --title "$title" --body-file "$f"
  rm -f "$f"
}

echo "Creating 25 issues…"

one '🔴 BUG: "Create auction room" button on dashboard redirects to landing page instead of /room/create' <<'MD'
## Description
When a logged-in user clicks **Create auction room** on `/dashboard`, they are redirected to the marketing landing page (`/`) instead of `/room/create`.

## Steps to Reproduce
1. Sign in with Google
2. Open `/dashboard`
3. Click **Create auction room**
4. **Actual:** Redirected to `/`
5. **Expected:** `/room/create` with the form visible

## Investigation
- Confirm `href` on dashboard CTA is `/room/create`
- Confirm `middleware.ts` does not send authenticated users to `/`
- Confirm `(app)/room/create/page.tsx` exists

## Acceptance Criteria
- [ ] Dashboard CTA opens `/room/create` while logged in
- [ ] Create room form renders
- [ ] No spurious redirect to `/` for authenticated users
MD

one '🔴 BUG: Authenticated users are redirected to landing page from multiple entry points' <<'MD'
## Description
Some internal links may send **authenticated** users to `/` instead of app routes (`/dashboard`, `/room/*`, `/league/*`).

## Affected flows (verify)
- [ ] Dashboard → Create auction room
- [ ] League pages → Dashboard
- [ ] Other internal links

## Expected
- Unauthenticated + protected route → `/login?next=…`
- Authenticated + `/` → `/dashboard` (see middleware)
- Authenticated + app routes → allow

## Acceptance Criteria
- [ ] No authenticated user lands on `/` unless they signed out
- [ ] Internal CTAs hit the intended route
MD

one '🔴 BUG: "Dashboard" button on private league page navigates to landing page instead of /dashboard' <<'MD'
## Description
On `/league/private/[id]`, **Dashboard** should go to `/dashboard`, not `/`.

## Fix
- Ensure `Link href="/dashboard"` (not `/`)

## Acceptance Criteria
- [ ] Dashboard button routes to `/dashboard`
MD

one '🔴 BUG: First page after sign-in should be /dashboard, not /room/create' <<'MD'
## Description
After Google OAuth, users land on `/room/create` when `next=/room/create`. Product home should be `/dashboard` for orientation.

## Expected
- OAuth callback sends users to `/dashboard` when `next` would have been `/room/create`
- Preserve other `next` values (e.g. `/dashboard?join=CODE`)

## Acceptance Criteria
- [ ] New sign-in from “Start a free auction” lands on `/dashboard`
- [ ] Invite/join deep links still work
MD

one '🟡 UX: Authenticated users visiting / should auto-redirect to /dashboard' <<'MD'
## Description
Signed-in users who open `/` should be redirected to `/dashboard`.

## Acceptance Criteria
- [ ] `/` + session → `/dashboard`
- [ ] `/` + no session → marketing page
MD

one '🟡 UX: Navbar "Home" link should go to /dashboard for authenticated users' <<'MD'
## Description
**Home** in the app shell should behave as app home (`/dashboard`) for signed-in users.

## Acceptance Criteria
- [ ] Logged-in: primary nav home → `/dashboard`
- [ ] Logged-out marketing: link behavior as designed
MD

one '🟡 CLEANUP: Remove test rooms from dashboard or add delete functionality' <<'MD'
## Description
Dashboard lists stale/test rooms; hosts need delete or archive.

## Requirements
- Host-only delete or archive
- Confirmation dialog
- Optional: hide completed / filter by status

## Acceptance Criteria
- [ ] Host can remove rooms they own
- [ ] Members cannot delete others’ rooms
MD

one '🔴 BUG: Scoring page shows developer documentation — hide internal notes from users' <<'MD'
## Description
`/scoring` must be user-facing rules only — no API routes, roadmap, or engineering notes.

## Acceptance Criteria
- [ ] Only scoring tables / player-facing copy
- [ ] Title: **Scoring system** + short subtitle on how points work
MD

one '🟡 BUG: CricAPI rate limit error shown as raw toast — add graceful error handling' <<'MD'
## Description
Rate-limit responses should show a friendly message, not raw provider text.

## Acceptance Criteria
- [ ] Friendly title + short explanation
- [ ] No internal error strings in toasts
MD

one '🟡 UX: Player database incomplete — seed all IPL 2026 players' <<'MD'
## Description
Sheet import should match most names against `players`. Expand seed beyond MVP list.

## Acceptance Criteria
- [ ] Large IPL pool in `players` for `ipl_2026`
- [ ] Import match rate high without placeholders
MD

one '🟡 UX: Practice mode needs real player names and visual polish' <<'MD'
## Description
Practice should feel closer to live auction: real names from DB, purse/squad hints, stronger layout.

## Acceptance Criteria
- [ ] Uses `players` data where possible
- [ ] Clear bid log and budget feedback
MD

one '🟡 UX: Profile page is mostly empty — add edit functionality and stats' <<'MD'
## Description
Profile should allow edit display name / username (unique) and show basic stats.

## Acceptance Criteria
- [ ] Editable fields with validation
- [ ] Hosted / joined counts
MD

one '🟡 UX: Create room form — display purse in ₹ Cr format, not raw lakhs' <<'MD'
## Description
Purse units are confusing (Cr vs lakhs). Clarify label + live “= ₹X Cr” helper.

## Acceptance Criteria
- [ ] No ambiguity in units
- [ ] Helper matches input format
MD

one '🟡 UX: Import page — auto-select column mappings when CSV headers match' <<'MD'
## Description
Auto-map Team / Player / CVC columns when headers are conventional.

## Acceptance Criteria
- [ ] Sensible defaults after paste
- [ ] User can override
MD

one '🟡 UX: League page — hide Host Tools section from non-host users' <<'MD'
## Description
CricAPI IDs / mock score controls / env hints must be host-only. Members see roster + leaderboard only.

## Acceptance Criteria
- [ ] Host tools hidden from non-hosts
- [ ] Member copy is non-technical
MD

one '🟢 UX: Add loading states to all buttons and page transitions' <<'MD'
## Description
Action buttons should show loading/disable to prevent double submits; skeletons on key pages.

## Acceptance Criteria
- [ ] Buttons show busy state
- [ ] Key lists skeleton while loading
MD

one '🟢 UX: Landing page "Already have an account? Sign in" is barely visible' <<'MD'
## Description
Increase contrast or move sign-in near hero / header.

## Acceptance Criteria
- [ ] Returning users can find sign-in quickly
MD

one '🟢 FEATURE: Add "Delete room" option for hosts' <<'MD'
## Description
Hosts need to remove abandoned rooms from dashboard.

## Acceptance Criteria
- [ ] Confirm destructive action
- [ ] Deletes cascade or blocks appropriately with fantasy leagues
MD

one '🟢 FEATURE: Add onboarding flow for first-time users' <<'MD'
## Description
First visit: short guided choices (create / join / practice). Persist dismissal.

## Acceptance Criteria
- [ ] Shown once (or until dismissed)
- [ ] Clear CTAs
MD

one '🟢 UX: Testimonials on landing page should feel authentic' <<'MD'
## Description
Replace placeholder quotes before broad marketing, or reframe section honestly.

## Acceptance Criteria
- [ ] No fabricated testimonials as “real” quotes
MD

one '🟢 FEATURE: Mobile responsive audit and fixes' <<'MD'
## Description
Verify 375px layouts for landing, dashboard, lobby, live auction, league, import, practice.

## Acceptance Criteria
- [ ] No horizontal scroll
- [ ] Tap targets ≥ 44px where possible
MD

one '🟢 FEATURE: Add toast notifications for key actions' <<'MD'
## Description
Consistent Sonner toasts for room create, join, bids, import, score sync — friendly errors.

## Acceptance Criteria
- [ ] Success + error patterns documented
- [ ] No raw API errors
MD

one '🟢 INFRA: Add Vercel Analytics and Speed Insights' <<'MD'
## Description
Add `@vercel/analytics` and `@vercel/speed-insights` in `app/layout.tsx`.

## Acceptance Criteria
- [ ] Analytics visible in Vercel project
MD

one '🟢 INFRA: Implement CricAPI response caching to prevent rate limit hits' <<'MD'
## Description
Avoid repeat scorecard fetches for the same `match_id` / completed fixtures.

## Acceptance Criteria
- [ ] Cache or skip when scores already exist
- [ ] Rate-limit errors rare + user-safe
MD

one '🟢 DATA: Seed complete IPL 2026 player database (200+ players)' <<'MD'
## Description
Expand `players` seed to full squads; align names with scorecard providers where possible.

## Acceptance Criteria
- [ ] ~200+ rows for `ipl_2026`
- [ ] High sheet import match rate
MD

echo "Done. Issues created in the default repo for this directory (gh)."
