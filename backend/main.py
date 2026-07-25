"""
FastAPI backend that exposes clean JSON for the fantasy site frontend.

Run:  uvicorn main:app --reload --port 8000   (from the backend/ folder)

Every endpoint degrades gracefully: if ESPN is unreachable or the league
isn't configured yet, it returns HTTP 503 with a message instead of a
stack trace, and the frontend falls back to its sample data.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # must run before importing espn_client (it reads env at import)

from fastapi import FastAPI, HTTPException, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

import espn_client as espn  # noqa: E402

app = FastAPI(title="Fantasy Football API", version="1.0.0")

_origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _guard(fn, *args, **kwargs):
    """Run a client call, converting known failures into clean HTTP errors."""
    try:
        return fn(*args, **kwargs)
    except espn.ConfigError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # ESPN outage, bad cookies, rate limit, etc.
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach ESPN: {type(e).__name__}: {e}",
        )


@app.get("/api/health")
def health():
    return {"status": "ok", "leagueConfigured": espn.LEAGUE_ID != 0}


@app.get("/api/teams")
def teams():
    """List every team + id so you can find your own TEAM_ID."""
    return _guard(espn.all_teams)


@app.get("/api/team")
def team():
    return _guard(espn.team_summary)


@app.get("/api/schedule")
def schedule():
    return _guard(espn.schedule)


@app.get("/api/scoreboard")
def scoreboard(week: int | None = Query(default=None, ge=1, le=18)):
    return _guard(espn.box_scores, week)


@app.get("/api/roster")
def roster():
    return _guard(espn.roster)


@app.get("/api/news")
def news():
    return _guard(espn.all_news)


@app.get("/api/refresh")
def refresh():
    """Force-drop the cached league on the next call."""
    espn._cache["ts"] = 0.0
    return {"status": "cache cleared"}
