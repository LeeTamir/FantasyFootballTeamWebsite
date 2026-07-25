# Deploying the site

Two pieces get deployed to two hosts:

- **Frontend** (this Vite app) → **Vercel** (static site)
- **Backend** (`backend/`, FastAPI) → **Railway** (a persistent Python server that
  holds your ESPN cookies and talks to ESPN)

They talk to each other over the internet, so you deploy both, note each one's
public URL, then tell each side about the other. There's a small
chicken-and-egg step at the end — that's normal.

---

## Step 1 — Backend on Railway

1. Go to https://railway.app, sign in with GitHub.
2. **New Project → Deploy from GitHub repo** → pick
   `LeeTamir/FantasyFootballTeamWebsite`.
3. Open the created service → **Settings**:
   - **Root Directory:** `backend`  ← important, the server lives in that subfolder.
   - Railway auto-detects Python, installs `requirements.txt`, and starts it with
     the `Procfile` (`uvicorn main:app --host 0.0.0.0 --port $PORT`). If it ever
     asks for a start command, paste that line.
4. Open **Variables** and add these (same values as your local `backend/.env`):

   | Variable | Value |
   |---|---|
   | `LEAGUE_ID` | your league id |
   | `YEAR` | `2026` |
   | `ESPN_S2` | your ESPN_S2 cookie |
   | `SWID` | your SWID cookie |
   | `TEAM_ID` | your team id |
   | `TEAM_NAME` | `Lee's Team` |
   | `NFL_WEEK1_DATE` | `2026-09-10` |
   | `CACHE_TTL_SECONDS` | `60`  ← low, so scores/news refresh often |
   | `CORS_ORIGINS` | *(fill in after Step 2 — your Vercel URL)* |

   > These are **server-side secrets**. They live only on Railway — never in the
   > frontend / Vercel project, and never `VITE_`-prefixed.

5. **Settings → Networking → Generate Domain.** Copy the URL, e.g.
   `https://fantasyfootball-production.up.railway.app`. Test it:
   `https://<that-url>/api/health` should return `{"status":"ok",...}`.

---

## Step 2 — Frontend on Vercel

1. Go to https://vercel.com, sign in with GitHub.
2. **Add New → Project** → import `LeeTamir/FantasyFootballTeamWebsite`.
3. Vercel auto-detects **Vite** (Build `npm run build`, Output `dist`). Leave defaults.
4. **Environment Variables** — add one:

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE` | your Railway URL from Step 1 (e.g. `https://fantasyfootball-production.up.railway.app`) |

5. **Deploy.** Vercel gives you a URL like `https://fantasy-football-team.vercel.app`.

---

## Step 3 — Introduce them (the chicken-and-egg part)

Now that you know the Vercel URL, let the backend accept requests from it:

1. Back on **Railway → Variables**, set:
   `CORS_ORIGINS = https://fantasy-football-team.vercel.app`
   (your real Vercel URL, no trailing slash). Railway redeploys automatically.
2. Open your Vercel URL — News and Scoreboard should now show live data, and the
   scoreboard/news refresh on their own every 60 seconds.

---

## Redeploying later

- **Code changes:** just `git push`. Both Railway and Vercel auto-redeploy from
  GitHub on every push.
- **New articles:** editing `backend/manual_news.json` is a code change — push it,
  Railway redeploys, done.
- **Changed an env var:** update it in the host's dashboard (no push needed);
  the host redeploys.

## Notes

- Only the frontend's `VITE_API_BASE` is public (it's baked into the browser
  bundle). Everything sensitive stays on Railway.
- If a Railway free trial expires, the backend goes down and the site falls back
  to "Backend offline"; the frontend itself keeps working.
