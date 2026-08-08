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
import math
import os
import threading
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
    boxes = _box_scores_for_week(league, week)
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


# ── Fake "Vegas" odds (computed from projected points) ────────────────────
# Std deviation of one team's weekly fantasy score; the margin between two
# independent teams then has std = sqrt(2) * this (~37 pts).
FANTASY_TEAM_STD = 26.0
MARGIN_STD = FANTASY_TEAM_STD * math.sqrt(2)
# Overround (house "vig") folded into the moneyline. ~0.05 prices a true
# pick'em at about -110 / -110, like a real sportsbook.
ODDS_OVERROUND = 0.05

STARTER_EXCLUDED_SLOTS = {"BE", "BENCH", "IR"}


def _is_starter(slot: str) -> bool:
    return (slot or "").upper() not in STARTER_EXCLUDED_SLOTS


def _round_half(x: float) -> float:
    return round(x * 2) / 2


def _normal_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _american_ml(prob: float) -> int:
    """American moneyline from an implied probability, rounded to a book-like 5."""
    prob = min(max(prob, 0.01), 0.99)
    ml = -100 * prob / (1 - prob) if prob >= 0.5 else 100 * (1 - prob) / prob
    return int(round(ml / 5.0) * 5)


def compute_odds(proj_me: float, proj_opp: float, me_abbrev: str, opp_abbrev: str) -> dict:
    """Spread / total / moneyline derived from the two projected team totals."""
    margin = proj_me - proj_opp  # positive => I'm favored
    total = _round_half(proj_me + proj_opp)
    spread = _round_half(abs(margin))

    p_me = _normal_cdf(margin / MARGIN_STD) if MARGIN_STD else (1.0 if margin > 0 else 0.0)
    p_opp = 1 - p_me
    q_me = p_me * (1 + ODDS_OVERROUND)   # juiced implied probabilities
    q_opp = p_opp * (1 + ODDS_OVERROUND)

    me_favored = margin >= 0
    return {
        "projected": {"me": round(proj_me, 1), "opp": round(proj_opp, 1)},
        "spread": {
            "favorite": me_abbrev if me_favored else opp_abbrev,
            "me": (-spread if me_favored else spread) or 0,
            "opp": (spread if me_favored else -spread) or 0,
        },
        "total": total,
        "moneyline": {"me": _american_ml(q_me), "opp": _american_ml(q_opp)},
        "winProb": {"me": round(p_me, 3), "opp": round(p_opp, 3)},
    }


def _game_status(p) -> tuple[str, Optional[float]]:
    """Map a player's game progress to scheduled / live / final."""
    gp = getattr(p, "game_played", None)  # 0..100 (% of game elapsed)
    if gp is None:
        return "scheduled", None
    if gp >= 100:
        return "final", gp
    if gp > 0:
        return "live", gp
    return "scheduled", gp


# Canonical starting-lineup order for the box score.
_SLOT_ORDER = {"QB": 0, "RB": 1, "WR": 2, "TE": 3, "FLEX": 4, "D/ST": 5, "K": 6}


def _slot_display(slot: str) -> str:
    """Human-friendly slot label. ESPN's flex slot comes through as
    'RB/WR/TE' (or similar) — show it as 'FLEX'; normalize defense to 'D/ST'."""
    s = (slot or "").upper()
    if s in ("DEF", "DST", "D/ST"):
        return "D/ST"
    if "/" in s:  # ESPN flex slots: RB/WR/TE, WR/TE, ...
        return "FLEX"
    return slot or ""


def _slot_rank(slot: str) -> int:
    return _SLOT_ORDER.get(_slot_display(slot).upper(), 90)


def _matchup_player(p) -> dict:
    status, gp = _game_status(p)
    return {
        "name": getattr(p, "name", ""),
        "slot": _slot_display(getattr(p, "slot_position", "")),
        "position": getattr(p, "position", ""),
        "proTeam": getattr(p, "proTeam", ""),
        "proOpponent": getattr(p, "pro_opponent", ""),
        "projected": round(getattr(p, "projected_points", 0) or 0, 1),
        "points": round(getattr(p, "points", 0) or 0, 1),
        "gameStatus": status,
        "gamePlayed": gp,
    }


def _team_side(team, lineup) -> dict:
    starters = [p for p in lineup if _is_starter(getattr(p, "slot_position", ""))]
    # Show in a consistent lineup order (QB, RB, WR, TE, FLEX, D/ST, K) rather
    # than ESPN's draft/roster order.
    starters.sort(key=lambda p: _slot_rank(getattr(p, "slot_position", "")))
    proj = sum((getattr(p, "projected_points", 0) or 0) for p in starters)
    return {
        "teamName": getattr(team, "team_name", "Bye") if team else "Bye",
        "teamAbbrev": getattr(team, "team_abbrev", "") if team else "",
        "projected": round(proj, 1),
        "starters": [_matchup_player(p) for p in starters],
    }


def _demo_matchup(week: Optional[int]) -> dict:
    """Sample box score + odds for previewing the UI before the season starts.
    Enabled by setting DEMO_MATCHUP=1; short-circuits real ESPN data. Projections,
    scores, totals and odds all vary deterministically per week, so week 2 looks
    different from week 1 (mirroring ESPN's real weekly projections)."""
    seed = week or 1

    def wk_proj(base: float, i: int) -> float:
        # deterministic weekly wiggle, ~±20% of the player's baseline projection
        f = 0.80 + (((seed * 7 + i * 13) % 41) / 100.0)  # 0.80 .. 1.20
        return round(base * f, 1)

    def wk_pts(proj: float, i: int, status: str) -> float:
        if status == "scheduled":
            return 0.0
        f = 0.45 + (((seed * 5 + i * 17) % 100) / 100.0)  # 0.45 .. 1.44 of proj
        return round(proj * f, 1)

    # (name, slot, pos, proTeam, proOpp, baseProj, status, gamePlayed)
    me_base = [
        ("Patrick Mahomes", "QB", "QB", "KC", "vs DEN", 22.5, "final", 100),
        ("Bijan Robinson", "RB", "RB", "ATL", "@ CAR", 19.2, "live", 55),
        ("Saquon Barkley", "RB", "RB", "PHI", "vs DAL", 17.8, "scheduled", 0),
        ("Justin Jefferson", "WR", "WR", "MIN", "@ GB", 16.4, "final", 100),
        ("CeeDee Lamb", "WR", "WR", "DAL", "@ PHI", 15.1, "live", 40),
        ("Trey McBride", "TE", "TE", "ARI", "vs SF", 11.2, "final", 100),
        ("Jahmyr Gibbs", "FLEX", "RB", "DET", "vs CHI", 14.0, "scheduled", 0),
        ("Ravens D/ST", "D/ST", "D/ST", "BAL", "@ CIN", 7.0, "live", 30),
        ("Harrison Butker", "K", "K", "KC", "vs DEN", 8.5, "final", 100),
    ]
    opp_base = [
        ("Josh Allen", "QB", "QB", "BUF", "vs NYJ", 23.1, "final", 100),
        ("Christian McCaffrey", "RB", "RB", "SF", "@ ARI", 20.0, "live", 45),
        ("De'Von Achane", "RB", "RB", "MIA", "vs LAR", 15.6, "final", 100),
        ("Tyreek Hill", "WR", "WR", "MIA", "vs LAR", 16.2, "final", 100),
        ("Amon-Ra St. Brown", "WR", "WR", "DET", "vs CHI", 14.3, "scheduled", 0),
        ("Sam LaPorta", "TE", "TE", "DET", "vs CHI", 10.1, "scheduled", 0),
        ("Kyren Williams", "FLEX", "RB", "LAR", "@ MIA", 13.4, "live", 45),
        ("Bills D/ST", "D/ST", "D/ST", "BUF", "vs NYJ", 6.8, "final", 100),
        ("Jake Elliott", "K", "K", "PHI", "vs DAL", 8.1, "scheduled", 0),
    ]

    def build(base_list, offset):
        starters, proj_total, pts_total = [], 0.0, 0.0
        for i, (name, slot, pos, team, opp, base, status, gp) in enumerate(base_list):
            proj = wk_proj(base, i + offset)
            pts = wk_pts(proj, i + offset, status)
            proj_total += proj
            pts_total += pts
            starters.append({
                "name": name, "slot": slot, "position": pos, "proTeam": team,
                "proOpponent": opp, "projected": proj, "points": pts,
                "gameStatus": status, "gamePlayed": gp,
            })
        return starters, round(proj_total, 1), round(pts_total, 1)

    me_starters, me_proj, me_pts = build(me_base, 0)
    opp_starters, opp_proj, opp_pts = build(opp_base, 100)

    me = {"teamName": TEAM_NAME or "Lee's Team", "teamAbbrev": "LT",
          "projected": me_proj, "points": me_pts, "starters": me_starters}
    opp = {"teamName": "Rivals FC", "teamAbbrev": "RIV",
           "projected": opp_proj, "points": opp_pts, "starters": opp_starters}
    return {
        "week": seed, "status": "live", "me": me, "opp": opp,
        "odds": compute_odds(me_proj, opp_proj, "LT", "RIV"),
    }


_box_lock = threading.Lock()


def _box_scores_for_week(league, week: Optional[int]):
    """league.box_scores(week) ignores any week greater than the current week
    (it falls back to the current week), so future weeks return today's
    projections. Temporarily raise current_week so the library actually fetches
    the requested week's projections, then restore it.

    Guarded by a lock because it mutates shared state on the cached league —
    concurrent calls must not observe or clobber the temporary value."""
    with _box_lock:
        if not week:
            return league.box_scores()
        saved = league.current_week
        try:
            if week > saved:
                league.current_week = week
            return league.box_scores(week)
        finally:
            league.current_week = saved


def matchup(week: Optional[int] = None) -> dict:
    """My team's matchup for a week: both starting lineups, totals, and odds."""
    if os.getenv("DEMO_MATCHUP"):
        return _demo_matchup(week)

    league = get_league()
    me = _find_my_team(league)
    if me is None:
        return {}

    boxes = _box_scores_for_week(league, week)
    my_id = me.team_id
    box = i_am_home = None
    for b in boxes:
        if getattr(b.home_team, "team_id", None) == my_id:
            box, i_am_home = b, True
            break
        if getattr(b.away_team, "team_id", None) == my_id:
            box, i_am_home = b, False
            break
    if box is None:
        return {}

    my_side = _team_side(box.home_team if i_am_home else box.away_team,
                         box.home_lineup if i_am_home else box.away_lineup)
    opp_side = _team_side(box.away_team if i_am_home else box.home_team,
                          box.away_lineup if i_am_home else box.home_lineup)
    my_side["points"] = round((box.home_score if i_am_home else box.away_score), 1)
    opp_side["points"] = round((box.away_score if i_am_home else box.home_score), 1)

    odds = compute_odds(my_side["projected"], opp_side["projected"],
                        my_side["teamAbbrev"] or "LT", opp_side["teamAbbrev"] or "OPP")

    progress = [pl["gamePlayed"] for pl in my_side["starters"] + opp_side["starters"]
                if pl["gamePlayed"] is not None]
    if progress and all(gp >= 100 for gp in progress):
        status = "final"
    elif any((gp or 0) > 0 for gp in progress):
        status = "live"
    else:
        status = "upcoming"

    return {
        "week": week or getattr(league, "current_week", None),
        "status": status,
        "me": my_side,
        "opp": opp_side,
        "odds": odds,
    }


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
