# AuctionArena

Real-time multiplayer auction rooms and season-long fantasy leagues (IPL-first).

**Repository:** [github.com/hariharankarthik/auctionarena](https://github.com/hariharankarthik/auctionarena)

Open this folder as your **Cursor / VS Code project root**. Requires **Node.js 20+**.

---

## Checklist: Supabase credentials → local UI test → GitHub → cloud host

### A. Get Supabase credentials

1. Go to [supabase.com](https://supabase.com) → **New project** (note the database password you set).
2. Wait until the project is **healthy**.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Client key:** either the legacy **`anon` `public` (JWT)** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or the newer **publishable** key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (the app accepts either).
4. You do **not** need the **service role** key for this app’s current routes (optional in `.env.example`).

### B. Apply database schema and seed data

5. In Supabase: **SQL Editor → New query**.
6. Paste and run **`supabase/migrations/001_initial_schema.sql`** → **Run** (wait for success).
7. Paste and run **`supabase/migrations/002_seed_ipl_players.sql`** → **Run**.
8. Paste and run **`supabase/migrations/003_team_lineup_fantasy_scores_update.sql`** → **Run** (starting XI, C/VC, fantasy score updates).

### C. Configure Auth (required for login / OAuth)

9. **Authentication → URL configuration**
   - **Site URL:** `http://localhost:3000` (for local dev).
   - **Redirect URLs:** add exactly  
     `http://localhost:3000/auth/callback`  
     (when you deploy, also add `https://YOUR-PRODUCTION-DOMAIN/auth/callback`).
10. **Authentication → Providers:** leave **Email** enabled; add **Google** only if you configure Google OAuth (optional for MVP).
11. If email confirmation blocks sign-in during testing: **Authentication → Providers → Email** → adjust “Confirm email” / use a test inbox, or disable confirmation for the dev project only.

### D. Run the app locally (visual smoke test)

12. In the repo root:
    ```bash
    npm install
    cp .env.example .env.local
    ```
13. Edit **`.env.local`**:
    - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL  
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key  
    - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
14. Start dev server:
    ```bash
    npm run dev
    ```
15. Open **http://localhost:3000** — you should see the marketing home page.
16. **Sign up** (email) or **sign in** → **Dashboard**.
17. **Create room** → **Lobby** → copy invite code; in a **second browser profile / incognito**, sign in as another user → **Join with code** → both **Ready** → host **Start live auction** → place a **bid** → host **Sold / End lot**.
18. **Solo dev (`npm run dev` only):** the lobby shows a dev banner and lets the host **Start** with **one** ready team (your host team). Production builds still require **two** teams.

Optional: `npm run test` (logic tests) and `npm run build` (production build check).

### E. Put changes in source control on GitHub

19. From the repo root:
    ```bash
    git status
    git add -A
    git commit -m "Describe your change"
    git push origin main
    ```
20. If `git push` asks for credentials: use a [GitHub Personal Access Token](https://github.com/settings/tokens) as the HTTPS password, **or** use SSH:
    ```bash
    git remote set-url origin git@github.com:hariharankarthik/auctionarena.git
    git push origin main
    ```

### F. Host on the cloud (e.g. Vercel)

21. Import the **GitHub** repo in [Vercel](https://vercel.com) (or your host of choice).
22. **Environment variables** (Production + Preview as needed), same names as local:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key variable your app uses)
    - `NEXT_PUBLIC_APP_URL` = your production URL (e.g. `https://your-app.vercel.app`)
    - `CRICAPI_KEY` = from [cricapi.com](https://www.cricapi.com) if hosts will use **Fetch CricAPI & score** (optional for auctions-only)
23. Deploy. Then in Supabase **Auth → URL configuration**, set **Site URL** to the production URL and add the production **`/auth/callback`** redirect URL.
24. Redeploy if you change env vars.

---

## Redirect safety

Post-login `next` query values are sanitized with `safeNextPath()` / `loginUrlWithNext()` in middleware, `/login`, `/auth/callback`, and server redirects from room pages.

---

## Optional

- **SUPABASE_SERVICE_ROLE_KEY**: not required for current routes.
- **Sounds:** add MP3s under `public/sounds/` (see `public/sounds/README.txt`).
