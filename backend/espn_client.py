"""
Thin wrapper around cwendt94/espn-api plus ESPN's public player-news feed.

Responsibilities:
  * Build and cache a `League` object (constructing one hits ESPN several
    times, so we reuse it for a short TTL instead of per request).
  * Locate "my" team from config (by TEAM_ID, else TEAM_NAME substring).
  * Serialize the pieces the frontend needs into plain dicts:
    team info, season record, schedule, box scores, and roster news.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from espn_api.football import League

# Your own hand-written news/rumors live here (merged into /api/news).
MANUAL_NEWS_PATH = Path(__file__).parent / "manual_news.json"

# ── config (read once at import) ──────────────────────────────────────────
LEAGUE_ID = int(os.getenv("LEAGUE_ID", "0"))
YEAR = int(os.getenv("YEAR", "2026"))
ESPN_S2 = os.getenv("ESPN_S2") or None
SWID = os.getenv("SWID") or None
TEAM_ID = os.getenv("TEAM_ID") or None
TEAM_NAME = os.getenv("TEAM_NAME", "").strip()
NFL_WEEK1_DATE = os.getenv("NFL_WEEK1_DATE", "2026-09-10")
NEWS_PLAYER_LIMIT = int(os.getenv("NEWS_PLAYER_LIMIT", "16"))
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))

NEWS_URL = "https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players"


class ConfigError(RuntimeError):
    """Raised when the backend is missing required configuration."""


# ── cached league ─────────────────────────────────────────────────────────
_cache: dict[str, Any] = {"league": None, "ts": 0.0}


def get_league(force: bool = False) -> League:
    """Return a cached League, rebuilding it when older than the TTL."""
    if LEAGUE_ID == 0:
        raise ConfigError(
            "LEAGUE_ID is not set. Copy backend/.env.example to backend/.env "
            "and fill in your league details."
        )

    fresh = (time.time() - _cache["ts"]) < CACHE_TTL_SECONDS
    if _cache["league"] is not None and fresh and not force:
        return _cache["league"]

    league = League(
        league_id=LEAGUE_ID,
        year=YEAR,
        espn_s2=ESPN_S2,
        swid=SWID,
    )
    _cache["league"] = league
    _cache["ts"] = time.time()
    return league


def _find_my_team(league: League):
    """Locate the configured team, matching by id first then by name."""
    if TEAM_ID:
        for t in league.teams:
            if str(t.team_id) == str(TEAM_ID):
                return t
    if TEAM_NAME:
        needle = TEAM_NAME.lower()
        for t in league.teams:
            if needle in (t.team_name or "").lower():
                return t
    # Fall back to the first team so the site still shows *something*.
    return league.teams[0] if league.teams else None


def _week1_date() -> datetime:
    try:
        return datetime.fromisoformat(NFL_WEEK1_DATE).replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime(YEAR, 9, 10, tzinfo=timezone.utc)


def _week_label_date(week: int) -> str:
    """Approximate calendar date for a given NFL week, e.g. 'Sep 10'."""
    d = _week1_date() + timedelta(days=7 * (week - 1))
    return d.strftime("%b %-d")


def _opponent_name(opp) -> tuple[str, str]:
    """espn-api may give schedule entries as Team objects or bare ids."""
    name = getattr(opp, "team_name", None)
    abbrev = getattr(opp, "team_abbrev", None)
    if name:
        return name, (abbrev or name[:4].upper())
    return f"Team {opp}", "OPP"


# ── serializers ───────────────────────────────────────────────────────────
def team_summary() -> dict:
    league = get_league()
    me = _find_my_team(league)
    if me is None:
        raise ConfigError("No teams found in league.")
    return {
        "teamId": me.team_id,
        "teamName": me.team_name,
        "teamAbbrev": me.team_abbrev,
        "wins": me.wins,
        "losses": me.losses,
        "ties": getattr(me, "ties", 0),
        "standing": getattr(me, "standing", None),
        "logoUrl": getattr(me, "logo_url", "") or "",
        "currentWeek": getattr(league, "current_week", None),
        "year": league.year,
    }


def all_teams() -> list[dict]:
    """Helper so the user can discover their TEAM_ID."""
    league = get_league()
    return [
        {
            "teamId": t.team_id,
            "teamName": t.team_name,
            "teamAbbrev": t.team_abbrev,
            "wins": t.wins,
            "losses": t.losses,
        }
        for t in league.teams
    ]


def schedule() -> list[dict]:
    """My matchup for each week: opponent, scores, outcome, approx date."""
    league = get_league()
    me = _find_my_team(league)
    if me is None:
        return []

    current_week = getattr(league, "current_week", 0) or 0
    out: list[dict] = []
    for i, opp in enumerate(me.schedule):
        week = i + 1
        opp_name, opp_abbrev = _opponent_name(opp)

        my_score = me.scores[i] if i < len(me.scores) else 0
        their_score = 0
        if hasattr(opp, "scores") and i < len(getattr(opp, "scores", [])):
            their_score = opp.scores[i]

        outcome_raw = me.outcomes[i] if i < len(me.outcomes) else "U"
        played = week < current_week or (my_score or their_score)
        if not played or outcome_raw in ("U", "UNDECIDED", None, ""):
            result = "upcoming"
        elif outcome_raw in ("W", "WIN"):
            result = "win"
        elif outcome_raw in ("L", "LOSS"):
            result = "loss"
        else:
            result = "tie"

        out.append(
            {
                "week": f"WK {week}",
                "weekNum": week,
                "opponent": opp_name,
                "opponentAbbrev": opp_abbrev,
                "myScore": round(my_score, 1) if result != "upcoming" else None,
                "theirScore": round(their_score, 1) if result != "upcoming" else None,
                "result": result,
                "date": _week_label_date(week),
            }
        )
    return out


def _box_player(p) -> dict:
    return {
        "name": getattr(p, "name", ""),
        "slot": getattr(p, "slot_position", ""),
        "position": getattr(p, "position", ""),
        "proTeam": getattr(p, "proTeam", ""),
        "points": round(getattr(p, "points", 0) or 0, 1),
        "projected": round(getattr(p, "projected_points", 0) or 0, 1),
    }


def box_scores(week: Optional[int] = None) -> list[dict]:
    """Every matchup for a week, with per-player lineups."""
    league = get_league()
    boxes = league.box_scores(week) if week else league.box_scores()
    result = []
    for b in boxes:
        home = b.home_team
        away = b.away_team
        result.append(
            {
                "homeTeam": getattr(home, "team_name", "Bye") if home else "Bye",
                "awayTeam": getattr(away, "team_name", "Bye") if away else "Bye",
                "homeAbbrev": getattr(home, "team_abbrev", "") if home else "",
                "awayAbbrev": getattr(away, "team_abbrev", "") if away else "",
                "homeScore": round(b.home_score, 1),
                "awayScore": round(b.away_score, 1),
                "homeLineup": [_box_player(p) for p in getattr(b, "home_lineup", [])],
                "awayLineup": [_box_player(p) for p in getattr(b, "away_lineup", [])],
            }
        )
    return result


def roster() -> list[dict]:
    league = get_league()
    me = _find_my_team(league)
    if me is None:
        return []
    return [
        {
            "playerId": getattr(p, "playerId", None),
            "name": getattr(p, "name", ""),
            "position": getattr(p, "position", ""),
            "proTeam": getattr(p, "proTeam", ""),
            "posRank": getattr(p, "posRank", None),
            "injuryStatus": getattr(p, "injuryStatus", None),
        }
        for p in me.roster
    ]


# ── roster-specific news ──────────────────────────────────────────────────
def _relative_time(iso: str) -> str:
    try:
        published = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return ""
    delta = datetime.now(timezone.utc) - published
    secs = int(delta.total_seconds())
    if secs < 3600:
        return f"{max(1, secs // 60)}m ago"
    if secs < 86400:
        return f"{secs // 3600}h ago"
    return f"{secs // 86400}d ago"


# ESPN injury designations that route a player's news to the INJURY tab.
# (Anything not in this set — e.g. ACTIVE, NORMAL, None — counts as healthy.)
INJURY_TAGS = {
    "QUESTIONABLE",
    "DOUBTFUL",
    "OUT",
    "INJURY_RESERVE",
    "IR",
    "PUP",
    "PHYSICALLY_UNABLE_TO_PERFORM",
    "DAY_TO_DAY",
}


def _is_injured(status: Optional[str]) -> bool:
    """True when ESPN flags the player with an active injury designation."""
    if not status:
        return False
    return str(status).upper().replace(" ", "_").replace("-", "_") in INJURY_TAGS


def _news_tag(injured: bool) -> str:
    """Where a rostered player's news belongs.

    Only two buckets are auto-assigned:
      * INJURY  — the player currently carries an ESPN injury tag.
      * NEWS    — everyone else (healthy players).
    RUMOR is never auto-assigned; it is reserved for manually-authored items.
    """
    return "INJURY" if injured else "NEWS"


def roster_news(limit_players: Optional[int] = None) -> list[dict]:
    """Fetch recent news for each rostered player and merge into one feed.

    A player's items are tagged INJURY only when ESPN currently lists that
    player as questionable/doubtful/out (etc.); otherwise they are tagged NEWS.
    """
    league = get_league()
    me = _find_my_team(league)
    if me is None:
        return []

    limit = limit_players or NEWS_PLAYER_LIMIT
    players = [p for p in me.roster if getattr(p, "playerId", None)][:limit]

    items: list[dict] = []
    seen_headlines: set[str] = set()

    with httpx.Client(timeout=8.0) as client:
        for p in players:
            status = getattr(p, "injuryStatus", None)
            injured = _is_injured(status)

            try:
                resp = client.get(NEWS_URL, params={"playerId": p.playerId})
                resp.raise_for_status()
                feed = resp.json().get("feed", []) or []
            except (httpx.HTTPError, ValueError):
                continue

            for entry in feed[:3]:  # a few most-recent per player
                headline = (entry.get("headline") or "").strip()
                if not headline or headline in seen_headlines:
                    continue
                seen_headlines.add(headline)

                # summary = short preview; body = the full article text.
                description = _strip_html(entry.get("description") or "")
                story = _strip_html(entry.get("story") or "")
                summary = (description or story)[:280]
                body = story or description or summary
                published = entry.get("published", "")
                rel = _relative_time(published)

                items.append(
                    {
                        "tag": _news_tag(injured),
                        "headline": headline,
                        "summary": summary,
                        "body": body,
                        "link": _news_link(entry),
                        "player": getattr(p, "name", ""),
                        "injuryStatus": status if injured else None,
                        "time": rel,
                        "published": published,
                        "hot": rel.endswith("h ago") or rel.endswith("m ago"),
                    }
                )

    items.sort(key=lambda x: x.get("published", ""), reverse=True)
    return items


def manual_articles() -> list[dict]:
    """Your own hand-written news/rumors from manual_news.json.

    Read fresh on every call, so editing the JSON shows up on the next page
    refresh — no server restart needed. Each entry may set: tag, headline,
    summary, body, player, published (ISO), hot, link.
    """
    try:
        raw = json.loads(MANUAL_NEWS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError, OSError):
        return []
    if not isinstance(raw, list):
        return []

    out: list[dict] = []
    for a in raw:
        if not isinstance(a, dict) or not a.get("headline"):
            continue
        published = a.get("published", "")
        summary = a.get("summary", "")
        out.append(
            {
                "tag": a.get("tag", "NEWS"),
                "headline": a.get("headline", ""),
                "summary": summary,
                "body": a.get("body") or summary,
                "link": a.get("link", ""),
                "player": a.get("player", ""),
                "injuryStatus": a.get("injuryStatus"),
                "time": _relative_time(published) if published else "",
                "published": published,
                "hot": bool(a.get("hot", False)),
            }
        )
    return out


def all_news() -> list[dict]:
    """Manual articles + live roster news, newest first.

    Manual articles always load; live roster news is best-effort so an ESPN
    outage or an unconfigured league never hides your own posts.
    """
    items = manual_articles()
    try:
        items = items + roster_news()
    except Exception:
        pass
    items.sort(key=lambda x: x.get("published", ""), reverse=True)
    return items


def _strip_html(text: str) -> str:
    import re

    return re.sub(r"<[^>]+>", "", text).replace("&nbsp;", " ").strip()


def _news_link(entry: dict) -> str:
    """Best available external URL for a news item (web preferred, else mobile)."""
    links = entry.get("links") or {}
    for key in ("web", "mobile"):
        href = (links.get(key) or {}).get("href")
        if href:
            return href
    return ""
