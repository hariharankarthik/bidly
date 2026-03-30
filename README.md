# AuctionArena

Real-time multiplayer auction rooms and season-long fantasy leagues (IPL-first).

**Repository:** [github.com/hariharankarthik/auctionarena](https://github.com/hariharankarthik/auctionarena)

Use this folder as your **Cursor / VS Code project root** — it is not part of any other monorepo.

## Push to GitHub (first time)

`origin` is already set to `https://github.com/hariharankarthik/auctionarena.git`. From this directory:

```bash
git push -u origin main
```

If HTTPS asks for credentials, use a [Personal Access Token](https://github.com/settings/tokens) as the password, or switch to SSH:

```bash
git remote set-url origin git@github.com:hariharankarthik/auctionarena.git
git push -u origin main
```

Or sign in with [GitHub CLI](https://cli.github.com/): `gh auth login` then `git push -u origin main`.

## Clone & run (on another machine)

```bash
git clone https://github.com/hariharankarthik/auctionarena.git
cd auctionarena
npm install
cp .env.example .env.local
npm run dev
```

Requires **Node.js 20+**.

## Deploy

Connect this GitHub repo to Vercel and add Supabase / CricAPI environment variables in the Vercel project settings.
