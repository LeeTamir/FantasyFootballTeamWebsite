# Fantasy Football Team Website

A personalized fantasy football team site — draft countdown, roster, news, and
a live scoreboard. The frontend is React + Vite; an optional Python backend
pulls **real** schedule, scores, records, and roster news from ESPN Fantasy.

Original design: https://www.figma.com/design/cQS1TC99auRf98ow93X3sD/Fantasy-Football-Team-Website

---

## 1. Frontend only (quick start)

The site runs on its own with built-in sample data — no backend required.

```bash
npm install      # first time only
npm run dev      # starts Vite at http://localhost:5173
```

Open http://localhost:5173. News and Scoreboard show sample content and a
"Backend offline · showing sample data" note until you start the backend below.

---

## 2. Live ESPN data (Python backend)

The backend uses [`cwendt94/espn-api`](https://github.com/cwendt94/espn-api) to
read your league, plus ESPN's public news feed for per-player headlines. Your
private-league cookies stay on the server and never reach the browser.

### Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                # then edit .env (see below)
```

### Configure `backend/.env`

| Variable | What it is |
|---|---|
| `LEAGUE_ID` | The number in your ESPN league URL (`...?leagueId=123456`). |
| `YEAR` | Season year, e.g. `2026`. |
| `ESPN_S2` / `SWID` | **Private leagues only.** Two cookies from fantasy.espn.com — log in, open DevTools → Application → Cookies → `https://fantasy.espn.com`, copy both values. Leave blank for public leagues. |
| `TEAM_ID` | Your team's id. Start the server, open http://localhost:8000/api/teams to see every team's id, then paste yours. (Falls back to matching `TEAM_NAME` if blank.) |

### Run the backend

```bash
# from backend/, with the venv activated:
uvicorn main:app --reload --port 8000
```

Sanity checks in your browser:
- http://localhost:8000/api/health — should say `{"status":"ok",...}`
- http://localhost:8000/api/teams — lists your league's teams (find your `TEAM_ID` here)
- http://localhost:8000/api/schedule — your matchups
- http://localhost:8000/api/news — roster-based headlines

> **Port 8000 already in use?** Pick another port
> (`uvicorn main:app --reload --port 8001`) and point the frontend at it by
> creating `.env.local` in the project root with
> `VITE_API_BASE=http://localhost:8001`, then restart `npm run dev`.

### Run both together

Two terminals:

```bash
# terminal 1 — backend
cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000

# terminal 2 — frontend
npm run dev
```

Reload http://localhost:5173 — the News and Scoreboard sections now show live
ESPN data, and the "sample data" notes switch to "Live … via ESPN".

---

## API endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Liveness + whether a league is configured |
| `GET /api/teams` | All teams with ids (for finding your `TEAM_ID`) |
| `GET /api/team` | Your team: name, abbrev, W/L/T record, standing |
| `GET /api/schedule` | Per-week opponent, scores, result |
| `GET /api/scoreboard?week=N` | Full box scores + per-player lineups |
| `GET /api/roster` | Your current roster |
| `GET /api/news` | Your own articles + live roster player news, newest first |
| `GET /api/refresh` | Clears the server-side cache |

Results are cached server-side for `CACHE_TTL_SECONDS` (default 5 min) so ESPN
isn't hit on every request.

---

## Writing your own news & rumors

Your hand-written articles live in **`backend/manual_news.json`** and are merged
into `/api/news` alongside the live ESPN player news. This is the only place
`RUMOR`-tagged items come from (ESPN news is auto-tagged only NEWS/INJURY).

Each entry:

```json
{
  "tag": "NEWS",              // NEWS | RUMOR | INJURY
  "headline": "Short headline shown on the card",
  "summary": "1–2 sentence preview shown when collapsed",
  "body": "Full article. Use \\n\\n between paragraphs.",
  "player": "Bijan Robinson",  // optional attribution (shown as a tag)
  "published": "2026-07-24T20:00:00Z",  // ISO date — controls sort + 'x ago'
  "hot": true,                 // optional — shows the HOT flame
  "link": ""                   // optional external URL ("Read full story")
}
```

The file is re-read on every request, so after editing it you just **refresh the
page** — no server restart needed.

---

## Notes

- **Private-league cookies are secrets.** They live only in `backend/.env`,
  which is gitignored. Never put them in frontend code.
- Live ESPN player news pulls headlines for whoever is on your roster, so that
  portion stays empty until after your draft (Aug 7) fills the team. Your own
  `manual_news.json` articles always show.
- `espn-api` has no news endpoint of its own — live news comes from ESPN's public
  `site.api.espn.com/apis/fantasy/v2/games/ffl/news/players` feed.
