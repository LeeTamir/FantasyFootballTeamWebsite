// Tiny typed client for the Python (FastAPI) backend.
// Base URL comes from VITE_API_BASE (see .env.local); defaults to localhost:8000.
// Every call is best-effort: on any failure the caller keeps its sample data.

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8000";

export type TeamSummary = {
  teamId: number;
  teamName: string;
  teamAbbrev: string;
  wins: number;
  losses: number;
  ties: number;
  standing: number | null;
  logoUrl: string;
  currentWeek: number | null;
  year: number;
};

export type ScheduleGame = {
  week: string;
  weekNum: number;
  opponent: string;
  opponentAbbrev: string;
  myScore: number | null;
  theirScore: number | null;
  result: "win" | "loss" | "tie" | "upcoming";
  date: string;
};

export type NewsItem = {
  tag: "NEWS" | "RUMOR" | "INJURY";
  headline: string;
  summary: string; // short preview shown when collapsed
  body?: string; // full article text shown when the card is expanded
  link?: string; // external URL to the original story, if any
  player: string;
  // ESPN injury designation (e.g. "QUESTIONABLE", "OUT"); only set on INJURY items.
  injuryStatus?: string | null;
  time: string;
  published: string;
  hot: boolean;
};

export type GameStatus = "scheduled" | "live" | "final";

export type MatchupPlayer = {
  name: string;
  slot: string;
  position: string;
  proTeam: string;
  proOpponent: string;
  projected: number;
  points: number;
  gameStatus: GameStatus;
  gamePlayed: number | null;
};

export type MatchupTeam = {
  teamName: string;
  teamAbbrev: string;
  projected: number;
  points: number;
  starters: MatchupPlayer[];
};

export type Odds = {
  projected: { me: number; opp: number };
  spread: { favorite: string; me: number; opp: number };
  total: number;
  moneyline: { me: number; opp: number };
  winProb: { me: number; opp: number };
};

export type Matchup = {
  week: number | null;
  status: "upcoming" | "live" | "final";
  me: MatchupTeam;
  opp: MatchupTeam;
  odds: Odds;
};

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  team: (signal?: AbortSignal) => getJSON<TeamSummary>("/api/team", signal),
  schedule: (signal?: AbortSignal) =>
    getJSON<ScheduleGame[]>("/api/schedule", signal),
  news: (signal?: AbortSignal) => getJSON<NewsItem[]>("/api/news", signal),
  matchup: (week: number, signal?: AbortSignal) =>
    getJSON<Matchup>(`/api/matchup?week=${week}`, signal),
};
