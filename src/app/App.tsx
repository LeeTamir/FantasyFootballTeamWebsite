import { useState, useEffect, useRef } from "react";
import { Clock, Users, Newspaper, BarChart3, ChevronRight, ChevronLeft, ChevronDown, Flame, Info, Menu, X, Trophy, ExternalLink } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { api, type TeamSummary, type ScheduleGame, type NewsItem, type Matchup, type MatchupTeam, type MatchupPlayer, type Odds } from "@/app/api";
import teamLogo from "@/imports/ChatGPT_Image_Jul_14__2026__10_11_10_PM.png";
import playerImg1 from "@/imports/Screenshot_2026-07-25_at_2.14.50_PM.png";
import playerImg2 from "@/imports/Screenshot_2026-07-25_at_2.15.36_PM.png";
import playerImg3 from "@/imports/Screenshot_2026-07-25_at_2.16.10_PM.png";
import playerImg4 from "@/imports/Screenshot_2026-07-25_at_2.16.45_PM.png";

const TEAM_NAME = "Lee's Team";
const TEAM_ABBR = "LT";
const SEASON = "2026";
const SEASON_START = new Date("2026-09-09T20:20:00-04:00");

// Meet the Team page is a work in progress — flip to true to re-enable it.
const ROSTER_ENABLED = false;

// Scrolling headline ticker at the very top of the page.
// Add your own items here anytime — the first item is the bold "lead".
const TICKER_ITEMS: { text: string; lead?: boolean }[] = [
  { text: "⚡ SEASON 1 KICKOFF — WEDNESDAY, SEP 9, 2026 · 8:20 PM ET", lead: true },
];

// Noun used in the "No … right now." empty state per news filter.
const EMPTY_LABEL: Record<"ALL" | "NEWS" | "RUMOR" | "INJURY", string> = {
  ALL: "news",
  NEWS: "news",
  RUMOR: "rumors",
  INJURY: "injuries",
};

const PLAYER_IMAGES = [playerImg1, playerImg2, playerImg3, playerImg4];

const ROSTER_SLOTS = [
  {
    pos: "QB", label: "Quarterback", num: "1",
    desc: "Every dynasty is built through the quarterback. The field general who reads defenses, extends plays, and delivers points week after week. Securing an elite QB in the early rounds sets the ceiling for this entire roster.",
  },
  {
    pos: "RB", label: "Running Back", num: "22",
    desc: "The workhorse. A three-down back who can carry the load, catch out of the backfield, and punch it in from the goal line. High-volume touches translate directly to fantasy gold.",
  },
  {
    pos: "RB", label: "Running Back", num: "28",
    desc: "The change-of-pace weapon. Built for big plays and receiving out of the backfield, this slot brings explosive upside and red-zone versatility to complement the starter.",
  },
  {
    pos: "WR", label: "Wide Receiver", num: "10",
    desc: "The WR1. A true number-one receiver who demands a top corner every game and still wins. Target share, air yards, and yards after the catch — this player delivers all three.",
  },
  {
    pos: "WR", label: "Wide Receiver", num: "11",
    desc: "The possession threat. Precise routes, reliable hands in traffic, and a knack for finding the end zone. The kind of receiver who quietly puts up 12–15 points without ever being the flashy pick.",
  },
  {
    pos: "TE", label: "Tight End", num: "87",
    desc: "An elite tight end is a matchup nightmare — too fast for linebackers, too physical for safeties. This slot is reserved for a player who gives a genuine positional advantage over the rest of the league.",
  },
  {
    pos: "FLEX", label: "Flex", num: "—",
    desc: "The wildcard. This slot gives full lineup flexibility — the best available RB, WR, or TE each week based on matchups, injury news, and game environment. Smart flex plays win championships.",
  },
  {
    pos: "K", label: "Kicker", num: "3",
    desc: "Points are points. A kicker on a high-powered offense in a dome stadium is worth targeting — consistent field goal attempts and extra points add up quietly across a full season.",
  },
  {
    pos: "DEF", label: "Defense / ST", num: "00",
    desc: "Defense wins championships — even in fantasy. Sacks, interceptions, fumble recoveries, and return touchdowns. A defense with a cushy schedule and a disruptive front four can carry a week by itself.",
  },
  {
    pos: "BN", label: "Bench", num: "—",
    desc: "The depth chart. A bye-week plug or a handcuff waiting to explode — bench management is where championships are quietly won and lost. This spot holds the roster's first insurance policy.",
  },
  {
    pos: "BN", label: "Bench", num: "—",
    desc: "The stash. Every great team has a high-upside sleeper sitting on the bench, waiting for an injury or a breakout. This is where end-of-draft value turns into playoff heroics.",
  },
  {
    pos: "BN", label: "Bench", num: "—",
    desc: "The handcuff. The backup who inherits a bell-cow workload the moment a starter goes down. Owning the right handcuff can swing an entire season — insurance you hope you never need.",
  },
  {
    pos: "BN", label: "Bench", num: "—",
    desc: "The upside swing. A boom-or-bust flier with league-winning ceiling. Some weeks he's unstartable, but the one time he pops, he wins you the matchup outright.",
  },
  {
    pos: "BN", label: "Bench", num: "—",
    desc: "The rookie. Raw, unproven, and dripping with potential. A developmental stash who could force his way into the starting lineup by midseason — patience is the play.",
  },
  {
    pos: "BN", label: "Bench", num: "—",
    desc: "The streamer. A rotating matchup play — the favorable QB, TE, or defense of the week. This spot never belongs to one player; it belongs to whoever has the softest matchup.",
  },
  {
    pos: "BN", label: "Bench", num: "—",
    desc: "The trade chip. Depth with real value — a piece to package in a deal or plug in when injuries strike. Every contender needs surplus, and this is where it lives.",
  },
];

const SAMPLE_SCHEDULE: ScheduleGame[] = [
  { week: "WK 1", weekNum: 1, opponent: "Gridiron Gurus", opponentAbbrev: "GG", myScore: null, theirScore: null, result: "upcoming", date: "Sep 10" },
  { week: "WK 2", weekNum: 2, opponent: "Field Goal Felons", opponentAbbrev: "FGF", myScore: null, theirScore: null, result: "upcoming", date: "Sep 17" },
  { week: "WK 3", weekNum: 3, opponent: "Blitz City FC", opponentAbbrev: "BC", myScore: null, theirScore: null, result: "upcoming", date: "Sep 24" },
  { week: "WK 4", weekNum: 4, opponent: "The End Zone Elites", opponentAbbrev: "EZE", myScore: null, theirScore: null, result: "upcoming", date: "Oct 1" },
];

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };

function useCountdown(target: Date): TimeLeft {
  const calc = () => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  };
  const [time, setTime] = useState<TimeLeft>(calc);
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  });
  return time;
}

function useInView(threshold = 0.25) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

type RosterSlot = (typeof ROSTER_SLOTS)[0];

function RosterPlayerSection({ slot, index }: { slot: RosterSlot; index: number }) {
  const { ref, visible } = useInView(0.2);
  const isEven = index % 2 === 0;
  const img = PLAYER_IMAGES[index % PLAYER_IMAGES.length];
  const posColor = posColors[slot.pos] ?? "#6b7280";

  return (
    <div
      ref={ref}
      className="relative flex flex-col md:flex-row min-h-[85vh] overflow-hidden"
      style={{
        background: index % 2 === 0
          ? "linear-gradient(135deg, #07090e 0%, #0c1018 100%)"
          : "linear-gradient(135deg, #0a0d14 0%, #07090e 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Subtle number watermark */}
      <div
        className="absolute select-none pointer-events-none font-black"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: "clamp(12rem, 30vw, 22rem)",
          lineHeight: 1,
          color: "rgba(255,255,255,0.025)",
          top: "50%",
          left: isEven ? "auto" : "0",
          right: isEven ? "0" : "auto",
          transform: "translateY(-50%)",
          zIndex: 0,
        }}
      >
        {slot.num !== "—" ? slot.num : slot.pos}
      </div>

      {/* Image side */}
      <div
        className={`relative w-full md:w-1/2 flex-shrink-0 transition-all duration-1000 ease-out ${isEven ? "md:order-1" : "md:order-2"}`}
        style={{
          minHeight: "420px",
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateX(0)"
            : isEven
            ? "translateX(-60px)"
            : "translateX(60px)",
        }}
      >
        <ImageWithFallback
          src={img}
          alt={`${slot.label} — Draft pick TBD`}
          className="w-full h-full object-cover object-top"
          style={{ minHeight: "420px" }}
        />
        {/* Edge gradient toward content */}
        <div
          className="absolute inset-0"
          style={{
            background: isEven
              ? "linear-gradient(to right, transparent 50%, #07090e 100%)"
              : "linear-gradient(to left, transparent 50%, #07090e 100%)",
          }}
        />
        {/* Bottom fade on mobile */}
        <div
          className="absolute inset-x-0 bottom-0 md:hidden h-32"
          style={{ background: "linear-gradient(to top, #07090e, transparent)" }}
        />
      </div>

      {/* Content side */}
      <div
        className={`relative z-10 flex flex-col justify-center px-8 md:px-14 py-12 w-full md:w-1/2 ${isEven ? "md:order-2" : "md:order-1"} transition-all duration-1000 ease-out`}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0)"
            : "translateY(40px)",
          transitionDelay: "150ms",
        }}
      >
        {/* Index counter */}
        <div
          className="text-xs mb-5 font-bold tracking-widest"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "#374151",
          }}
        >
          {String(index + 1).padStart(2, "0")} / {String(ROSTER_SLOTS.length).padStart(2, "0")}
        </div>

        {/* Position badge */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-sm font-black px-3 py-1 uppercase tracking-wider"
            style={{
              background: posColor + "1a",
              color: posColor,
              border: `1px solid ${posColor}40`,
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: "0.15em",
            }}
          >
            {slot.pos}
          </span>
          <span
            className="text-sm uppercase tracking-widest"
            style={{ color: "#4b5563", fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {slot.label}
          </span>
        </div>

        {/* Player name */}
        <h3
          className="font-black uppercase leading-none mb-2"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            color: "#e8eaf0",
            letterSpacing: "0.03em",
          }}
        >
          Draft Pick
        </h3>
        <h3
          className="font-black uppercase leading-none mb-6"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            color: "#c9961a",
            letterSpacing: "0.03em",
          }}
        >
          TBD
        </h3>

        {/* Gold rule */}
        <div className="w-12 h-0.5 mb-6" style={{ background: "#c9961a" }} />

        {/* Description */}
        <p
          className="text-base leading-relaxed max-w-sm"
          style={{ color: "#9ca3af", fontFamily: "'Inter', sans-serif" }}
        >
          {slot.desc}
        </p>

        {/* Draft badge */}
        <div className="flex items-center gap-2 mt-8">
          <Clock size={13} style={{ color: "#c9961a" }} />
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "#4b5563", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.2em" }}
          >
            Kickoff · Sep 9, 2026
          </span>
        </div>
      </div>
    </div>
  );
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative flex items-center justify-center w-20 h-20 md:w-32 md:h-32"
        style={{
          background: "linear-gradient(160deg, #161c27 60%, #1e2534)",
          border: "1px solid rgba(201,150,26,0.25)",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <span
          className="text-4xl md:text-6xl font-bold tabular-nums leading-none"
          style={{ color: "#c9961a" }}
        >
          {String(value).padStart(2, "0")}
        </span>
        <div
          className="absolute inset-x-0"
          style={{ top: "50%", height: "1px", background: "rgba(0,0,0,0.5)" }}
        />
      </div>
      <span
        className="text-xs tracking-widest uppercase mt-1"
        style={{ color: "#6b7280", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.18em" }}
      >
        {label}
      </span>
    </div>
  );
}

const posColors: Record<string, string> = {
  QB: "#ff4d94",   // bright pink (brighter than the old kicker pink)
  RB: "#f97316",   // orange (the old tight-end color)
  WR: "#60a5fa",   // lighter blue (than the old quarterback blue)
  TE: "#14b8a6",   // teal (the old flex color)
  K: "#c084fc",    // lighter purple (than the old wide-receiver purple)
  DEF: "#facc15",  // highlighter yellow (D/ST)
  FLEX: "#818cf8", // new distinct indigo (placeholder until a player fills it)
  BN: "#374151",   // bench — unchanged
};


const tagStyles: Record<string, { bg: string; color: string }> = {
  RUMOR: { bg: "rgba(201,150,26,0.15)", color: "#c9961a" },
  INJURY: { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  NEWS: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
};

function NewsCard({ item }: { item: NewsItem }) {
  const style = tagStyles[item.tag] ?? tagStyles.NEWS;
  const [expanded, setExpanded] = useState(false);
  const fullText = item.body || item.summary;
  const toggle = () => setExpanded((v) => !v);

  return (
    <div
      className="group flex gap-4 p-4 transition-colors duration-150 cursor-pointer hover:bg-white/[0.03]"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-xs font-bold px-2 py-0.5"
            style={{
              background: style.bg,
              color: style.color,
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: "0.08em",
            }}
          >
            {item.tag}
          </span>
          {item.injuryStatus && (
            <span
              className="text-xs font-bold px-2 py-0.5 uppercase"
              style={{
                background: "transparent",
                color: "#f87171",
                border: "1px solid rgba(248,113,113,0.4)",
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.08em",
              }}
            >
              {item.injuryStatus.replace(/_/g, " ")}
            </span>
          )}
          {item.hot && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "#f97316" }}>
              <Flame size={11} />
              HOT
            </span>
          )}
          {item.player && (
            <span
              className="text-xs uppercase"
              style={{ color: "#6b7280", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em" }}
            >
              {item.player}
            </span>
          )}
          <span className="ml-auto text-xs" style={{ color: "#4b5563", fontFamily: "'JetBrains Mono', monospace" }}>
            {item.time}
          </span>
        </div>
        <h3
          className="text-base font-bold uppercase mb-1 group-hover:text-accent transition-colors duration-150"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#e8eaf0", letterSpacing: "0.02em" }}
        >
          {item.headline}
        </h3>
        <p
          className={`text-sm leading-relaxed ${expanded ? "" : "line-clamp-2"}`}
          style={{ color: "#6b7280", whiteSpace: expanded ? "pre-line" : "normal" }}
        >
          {expanded ? fullText : item.summary}
        </p>
        {expanded && item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase mt-3 hover:opacity-80 transition-opacity"
            style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}
          >
            Read full story on ESPN
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      <ChevronRight
        size={16}
        className="flex-shrink-0 mt-1 opacity-30 group-hover:opacity-60 transition-all duration-200"
        style={{ color: "#c9961a", transform: expanded ? "rotate(90deg)" : "none" }}
      />
    </div>
  );
}

function ScoreboardRow({ match, onOpen }: { match: ScheduleGame; onOpen: () => void }) {
  const isUpcoming = match.result === "upcoming";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="group flex items-center gap-2 px-3 py-4 md:gap-4 md:px-5 cursor-pointer transition-colors hover:bg-white/[0.03]"
    >
      <div
        className="text-xs font-bold w-9 md:w-12 shrink-0"
        style={{ color: "#6b7280", fontFamily: "'JetBrains Mono', monospace" }}
      >
        {match.week}
      </div>
      <div className="flex-1 grid grid-cols-3 items-center gap-2">
        <div className="text-right">
          <span
            className="text-sm font-black uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#c9961a" }}
          >
            {TEAM_ABBR}
          </span>
          <div
            className="text-2xl font-black"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#e8eaf0" }}
          >
            {match.myScore ?? "—"}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: "#4b5563", fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {isUpcoming ? match.date : "FINAL"}
          </span>
          {isUpcoming && (
            <span
              className="text-xs px-2 py-0.5"
              style={{
                background: "rgba(201,150,26,0.1)",
                color: "#c9961a",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              UPCOMING
            </span>
          )}
        </div>
        <div className="text-left">
          <span
            className="text-sm font-black uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#6b7280" }}
          >
            OPP
          </span>
          <div
            className="text-2xl font-black"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#e8eaf0" }}
          >
            {match.theirScore ?? "—"}
          </div>
        </div>
      </div>
      <div className="text-right w-20 md:w-32 shrink-0">
        <span className="text-xs leading-tight" style={{ color: "#4b5563" }}>
          {match.opponent}
        </span>
      </div>
      <ChevronRight size={16} className="shrink-0 opacity-25 group-hover:opacity-70 transition-opacity" style={{ color: "#c9961a" }} />
    </div>
  );
}

function Ticker({ items }: { items: { text: string; lead?: boolean }[] }) {
  if (items.length === 0) return null;

  // Two identical copies scroll left in tandem; when the first copy has fully
  // moved off (-50% of the track), the second sits exactly where the first
  // started — so the loop is seamless. Pauses on hover.
  // Repeat the items enough that a single copy comfortably exceeds the viewport
  // width, so a short list (e.g. just the draft message) still fills the bar.
  const reps = Math.max(1, Math.ceil(8 / items.length));
  const filled = Array.from({ length: reps }, () => items).flat();

  const row = (copy: number) =>
    filled.map((item, i) => (
      <span
        key={`${copy}-${i}`}
        className={`mr-10 ${item.lead ? "font-bold" : "opacity-70"}`}
      >
        {item.text}
      </span>
    ));

  return (
    <div
      className="w-full overflow-hidden text-xs py-1.5 group"
      style={{
        background: "#c9961a",
        color: "#07090e",
        fontFamily: "'Barlow Condensed', sans-serif",
        letterSpacing: "0.1em",
      }}
    >
      <div
        className="ticker-track inline-flex whitespace-nowrap group-hover:[animation-play-state:paused]"
        style={{ animation: "ticker-scroll 28s linear infinite" }}
      >
        <span className="inline-flex pl-4">{row(0)}</span>
        <span className="inline-flex pl-4" aria-hidden="true">{row(1)}</span>
      </div>
    </div>
  );
}

// ── Week box-score detail (Scoreboard → click a week) ──────────────────────
function slotColor(slot: string): string {
  const s = (slot || "").toUpperCase();
  if (s.includes("QB")) return posColors.QB;
  if (s.includes("RB")) return posColors.RB;
  if (s.includes("WR")) return posColors.WR;
  if (s.includes("TE")) return posColors.TE;
  if (s.includes("FLEX")) return posColors.FLEX;
  if (s.includes("D/ST") || s.includes("DEF")) return posColors.DEF;
  if (s.includes("K")) return posColors.K;
  return "#6b7280";
}

const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function StatusBadge({ status }: { status: "upcoming" | "live" | "final" }) {
  const map = {
    upcoming: { label: "UPCOMING", color: "#c9961a", bg: "rgba(201,150,26,0.12)" },
    live: { label: "LIVE", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
    final: { label: "FINAL", color: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
  } as const;
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 uppercase"
      style={{ background: s.bg, color: s.color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}
    >
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.color }} />}
      {s.label}
    </span>
  );
}

function PlayerRow({ p }: { p: MatchupPlayer }) {
  const color = slotColor(p.slot);
  const live = p.gameStatus === "live";
  const done = p.gameStatus === "final";
  const ptsColor = live ? "#22c55e" : done ? "#e8eaf0" : "#4b5563";
  return (
    <div className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span
        className="text-xs font-black w-10 shrink-0 text-center px-1 py-0.5 uppercase"
        style={{ color, background: color + "1a", border: `1px solid ${color}40`, fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {p.slot}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: "#e8eaf0" }}>{p.name || "Empty"}</div>
        <div className="text-xs truncate" style={{ color: "#4b5563" }}>
          {[p.proTeam, p.proOpponent].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="text-right shrink-0 w-11">
        <div className="text-xs tabular-nums" style={{ color: "#6b7280", fontFamily: "'JetBrains Mono', monospace" }}>{p.projected.toFixed(1)}</div>
        <div className="text-[10px] uppercase tracking-wide" style={{ color: "#374151" }}>proj</div>
      </div>
      <div className="text-right shrink-0 w-14">
        <div className="text-base font-black tabular-nums flex items-center justify-end gap-1" style={{ color: ptsColor, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {live && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#22c55e" }} />}
          {p.gameStatus === "scheduled" ? "—" : p.points.toFixed(1)}
        </div>
        <div className="text-[10px] uppercase tracking-wide" style={{ color: "#374151" }}>pts</div>
      </div>
    </div>
  );
}

function LineupSide({ team, isMe }: { team: MatchupTeam; isMe: boolean }) {
  return (
    <div style={{ background: "linear-gradient(160deg, #0e1118, #0a0e16)", border: `1px solid ${isMe ? "rgba(201,150,26,0.25)" : "rgba(255,255,255,0.07)"}` }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="min-w-0">
          <div className="text-sm font-black uppercase truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: isMe ? "#c9961a" : "#e8eaf0", letterSpacing: "0.05em" }}>{team.teamName}</div>
          <div className="text-xs" style={{ color: "#4b5563" }}>Proj {team.projected.toFixed(1)}</div>
        </div>
        <div className="text-3xl font-black tabular-nums shrink-0 ml-3" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#e8eaf0" }}>{team.points.toFixed(1)}</div>
      </div>
      <div className="px-4">
        {team.starters.length ? (
          team.starters.map((p, i) => <PlayerRow key={i} p={p} />)
        ) : (
          <p className="text-center text-xs py-6" style={{ color: "#4b5563" }}>Lineup not set yet.</p>
        )}
      </div>
    </div>
  );
}

// Sportsbook-style odds grid: two team rows × Spread / Money / Total, each a
// boxed cell showing the line (white) over the juice (gold).
function OddsBreakdown({ odds, meAbbrev, oppAbbrev }: { odds: Odds; meAbbrev: string; oppAbbrev: string }) {
  const pick = odds.spread.me === 0;
  const meWin = Math.round(odds.winProb.me * 100);
  const oppWin = 100 - meWin;

  // Spread/total juice is cosmetic (a spread is ~50/50, so ~-110 a side). We
  // shade it slightly so the favorite lays a touch less, like a real book.
  const favWin = Math.max(odds.winProb.me, odds.winProb.opp);
  const shade = Math.round((favWin - 0.5) * 30);
  const meFav = odds.spread.me <= 0;
  const meSpreadJ = meFav ? -110 + shade : -110 - shade;
  const oppSpreadJ = meFav ? -110 - shade : -110 + shade;

  const StatBox = ({ line, sub }: { line: string; sub?: string }) => (
    <div
      className="flex flex-col items-center justify-center py-1.5 px-1 rounded"
      style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)" }}
    >
      <span className="text-sm font-black leading-tight tabular-nums" style={{ color: "#e8eaf0", fontFamily: "'Barlow Condensed', sans-serif" }}>{line}</span>
      {sub && <span className="text-[11px] leading-tight tabular-nums" style={{ color: "#c9961a", fontFamily: "'JetBrains Mono', monospace" }}>{sub}</span>}
    </div>
  );

  const Row = ({ abbr, isMe, spreadLn, spreadJ, ml, totLn }:
    { abbr: string; isMe: boolean; spreadLn: string; spreadJ: number; ml: number; totLn: string }) => (
    <div className="grid gap-1.5 items-stretch" style={{ gridTemplateColumns: "2.75rem 1fr 1fr 1fr" }}>
      <span className="flex items-center text-sm font-black uppercase" style={{ color: isMe ? "#c9961a" : "#e8eaf0", fontFamily: "'Barlow Condensed', sans-serif" }}>{abbr}</span>
      <StatBox line={spreadLn} sub={fmtSigned(spreadJ)} />
      <StatBox line={fmtSigned(ml)} />
      <StatBox line={totLn} sub={fmtSigned(isMe ? -112 : -108)} />
    </div>
  );

  return (
    <div className="px-3 md:px-4 pb-4 pt-1">
      <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: "2.75rem 1fr 1fr 1fr" }}>
        <span />
        {["Spread", "Money", "Total"].map((h) => (
          <span key={h} className="text-center text-[11px] uppercase tracking-widest" style={{ color: "#6b7280", fontFamily: "'Barlow Condensed', sans-serif" }}>{h}</span>
        ))}
      </div>
      <div className="space-y-1.5">
        <Row abbr={meAbbrev} isMe spreadLn={pick ? "PK" : fmtSigned(odds.spread.me)} spreadJ={meSpreadJ} ml={odds.moneyline.me} totLn={`O ${odds.total}`} />
        <Row abbr={oppAbbrev} isMe={false} spreadLn={pick ? "PK" : fmtSigned(odds.spread.opp)} spreadJ={oppSpreadJ} ml={odds.moneyline.opp} totLn={`U ${odds.total}`} />
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[11px] mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          <span style={{ color: "#c9961a" }}>{meAbbrev} {meWin}%</span>
          <span style={{ color: "#6b7280" }}>{oppWin}% {oppAbbrev}</span>
        </div>
        <div className="flex h-1 overflow-hidden rounded" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div style={{ width: `${meWin}%`, background: "#c9961a" }} />
          <div style={{ width: `${oppWin}%`, background: "#374151" }} />
        </div>
      </div>
      <p className="text-center text-[10px] mt-3" style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}>
        For entertainment · computed from projections
      </p>
    </div>
  );
}

// The current week's odds bar, shown inside that week's card on the Scoreboard.
// Fetches on mount (only one is rendered) and refreshes every 60s.
function WeekOddsDropdown({ weekNum }: { weekNum: number }) {
  const [open, setOpen] = useState(true); // open by default
  const [odds, setOdds] = useState<Odds | null>(null);
  const [abbrevs, setAbbrevs] = useState<{ me: string; opp: string }>({ me: "LT", opp: "OPP" });
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.matchup(weekNum)
        .then((m) => {
          if (cancelled) return;
          if (m && m.odds && m.me) {
            setOdds(m.odds);
            setAbbrevs({ me: m.me.teamAbbrev || "LT", opp: m.opp.teamAbbrev || "OPP" });
            setState("ready");
          } else {
            setState("empty");
          }
        })
        .catch(() => { if (!cancelled) setState("empty"); });
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [weekNum]);

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(201,150,26,0.035)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group w-full flex items-center gap-2 px-3 md:px-5 py-2.5 text-left"
        style={{ background: "none", cursor: "pointer", border: "none" }}
      >
        <span className="text-[11px] font-black uppercase" style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.18em" }}>Game Odds</span>
        <div className="ml-auto flex items-center gap-1.5">
          {state === "loading" && (
            <span className="text-xs" style={{ color: "#4b5563", fontFamily: "'JetBrains Mono', monospace" }}>…</span>
          )}
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 group-hover:scale-150 ${open ? "rotate-180" : ""}`}
            style={{ color: "#c9961a" }}
          />
        </div>
      </button>
      {open &&
        (state === "ready" && odds ? (
          <OddsBreakdown odds={odds} meAbbrev={abbrevs.me} oppAbbrev={abbrevs.opp} />
        ) : (
          <p className="text-center text-xs px-4 pb-3" style={{ color: "#4b5563" }}>
            {state === "loading" ? "Loading odds…" : "Odds appear once this week's projections are set."}
          </p>
        ))}
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="relative flex flex-col items-center justify-center text-center overflow-hidden px-4" style={{ minHeight: "70vh" }}>
      <div
        className="text-xs font-bold tracking-widest uppercase mb-3"
        style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.35em" }}
      >
        {SEASON} Season · {TEAM_NAME}
      </div>
      <h2
        className="text-6xl md:text-8xl font-black uppercase leading-none"
        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        Meet the Team
      </h2>
      <div className="h-0.5 w-24 mx-auto mt-5" style={{ background: "linear-gradient(90deg, transparent, #c9961a, transparent)" }} />
      <div
        className="mt-8 inline-flex items-center gap-2 px-4 py-2"
        style={{ border: "1px solid rgba(201,150,26,0.3)", background: "rgba(201,150,26,0.08)" }}
      >
        <Users size={16} style={{ color: "#c9961a" }} />
        <span
          className="text-sm font-black uppercase"
          style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.2em" }}
        >
          Coming Soon
        </span>
      </div>
      <p className="mt-5 max-w-sm text-sm" style={{ color: "#6b7280" }}>
        The full roster is on the way — check back soon.
      </p>
    </div>
  );
}

function WeekDetailView({ week, matchup, loading, onBack }: { week: number; matchup: Matchup | null; loading: boolean; onBack: () => void }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-6 text-xs font-bold uppercase"
        style={{ color: "#9ca3af", background: "none", cursor: "pointer", border: "none", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.15em" }}
      >
        <ChevronLeft size={14} /> Back to schedule
      </button>
      <div className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.3em" }}>
        Week {week} · Box Score
      </div>

      {loading && !matchup ? (
        <p className="text-sm py-10 text-center" style={{ color: "#6b7280" }}>Loading box score…</p>
      ) : !matchup ? (
        <div className="mt-2 p-6 text-center flex items-center gap-3 justify-center" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
          <Info size={16} style={{ color: "#60a5fa" }} />
          <p className="text-xs text-left" style={{ color: "#9ca3af" }}>
            This week's box score isn't available yet — lineups and live scoring appear once the season is underway.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="text-center flex-1 min-w-0">
              <div className="text-sm font-black uppercase truncate" style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif" }}>{matchup.me.teamAbbrev}</div>
              <div className="text-4xl md:text-5xl font-black tabular-nums leading-none" style={{ color: "#e8eaf0", fontFamily: "'Barlow Condensed', sans-serif" }}>{matchup.me.points.toFixed(1)}</div>
              <div className="text-xs mt-1" style={{ color: "#4b5563" }}>proj {matchup.me.projected.toFixed(1)}</div>
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <StatusBadge status={matchup.status} />
              <span className="text-xs" style={{ color: "#4b5563", fontFamily: "'Barlow Condensed', sans-serif" }}>vs</span>
            </div>
            <div className="text-center flex-1 min-w-0">
              <div className="text-sm font-black uppercase truncate" style={{ color: "#e8eaf0", fontFamily: "'Barlow Condensed', sans-serif" }}>{matchup.opp.teamAbbrev}</div>
              <div className="text-4xl md:text-5xl font-black tabular-nums leading-none" style={{ color: "#e8eaf0", fontFamily: "'Barlow Condensed', sans-serif" }}>{matchup.opp.points.toFixed(1)}</div>
              <div className="text-xs mt-1" style={{ color: "#4b5563" }}>proj {matchup.opp.projected.toFixed(1)}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <LineupSide team={matchup.me} isMe />
            <LineupSide team={matchup.opp} isMe={false} />
          </div>
        </>
      )}
    </div>
  );
}

type NavSection = "home" | "roster" | "news" | "scoreboard";

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const countdown = useCountdown(SEASON_START);

  // Live ESPN data (falls back to sample content until the backend answers).
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [schedule, setSchedule] = useState<ScheduleGame[]>(SAMPLE_SCHEDULE);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [newsFilter, setNewsFilter] = useState<"ALL" | "NEWS" | "RUMOR" | "INJURY">("ALL");

  // Week box-score detail (Scoreboard → click a week).
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [matchup, setMatchup] = useState<Matchup | null>(null);
  const [matchupLoading, setMatchupLoading] = useState(false);

  // Fetch live data on mount, then refresh every 60s so scores and news stay
  // current during games, plus an immediate refresh whenever the tab regains
  // focus. Each call is independent — one failing shouldn't blank the others.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.team().then((t) => { if (!cancelled) { setTeam(t); setIsLive(true); } }).catch(() => {});
      api.schedule().then((s) => { if (!cancelled && s.length) { setSchedule(s); setIsLive(true); } }).catch(() => {});
      api.news().then((n) => { if (!cancelled) { setNews(n); setIsLive(true); } }).catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // When a week is open, fetch its box score and keep it live (60s) too.
  useEffect(() => {
    if (selectedWeek == null) return;
    let cancelled = false;
    setMatchup(null);
    setMatchupLoading(true);
    const load = () => {
      api.matchup(selectedWeek)
        .then((m) => { if (!cancelled) setMatchup(m && m.me ? m : null); })
        .catch(() => { if (!cancelled) setMatchup(null); })
        .finally(() => { if (!cancelled) setMatchupLoading(false); });
    };
    load();
    const id = setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedWeek]);

  // Navigating to any section closes an open box score, so tapping "Scoreboard"
  // in the nav always returns to the schedule list (not the last week viewed).
  useEffect(() => {
    setSelectedWeek(null);
  }, [activeSection]);

  // Always land at the top of a section when switching (nav bar or home cards).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection, selectedWeek]);

  const filteredNews = newsFilter === "ALL" ? news : news.filter((n) => n.tag === newsFilter);

  // Odds only show for the current week — the first still-"upcoming" matchup.
  // As each week finalizes (W/L posts), this advances to the next week.
  const activeOddsWeek = schedule.find((g) => g.result === "upcoming")?.weekNum ?? null;

  const nav: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Trophy size={14} /> },
    { id: "roster", label: "Meet the Team", icon: <Users size={14} /> },
    { id: "news", label: "News & Rumors", icon: <Newspaper size={14} /> },
    { id: "scoreboard", label: "Scoreboard", icon: <BarChart3 size={14} /> },
  ];

  return (
    <div
      className="min-h-screen"
      style={{ background: "#07090e", fontFamily: "'Inter', sans-serif", color: "#e8eaf0" }}
    >
      {/* Top ticker (scrolling) */}
      <Ticker items={TICKER_ITEMS} />

      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-0"
        style={{
          background: "rgba(7,9,14,0.96)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 py-4">
          <div
            className="w-10 h-10 flex items-center justify-center flex-shrink-0"
            style={{ filter: "invert(1) sepia(1) saturate(3) hue-rotate(5deg) brightness(0.9)" }}
          >
            <ImageWithFallback
              src={teamLogo}
              alt="Lee's Team logo — LT monogram in a circle"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div>
            <div
              className="text-xl font-black uppercase leading-none"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em" }}
            >
              {TEAM_NAME}
            </div>
            <div
              className="text-xs"
              style={{ color: "#6b7280", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {SEASON} FANTASY SEASON
            </div>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className="flex items-center gap-2 px-4 py-5 text-sm font-semibold uppercase transition-colors duration-150 relative"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.1em",
                color: activeSection === item.id ? "#c9961a" : "#9ca3af",
                borderBottom: activeSection === item.id ? "2px solid #c9961a" : "2px solid transparent",
                background: "none",
                cursor: "pointer",
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2"
          style={{ color: "#9ca3af", background: "none", cursor: "pointer" }}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-x-0 z-40 px-4 py-4 flex flex-col gap-1"
          style={{
            top: "89px",
            background: "#0e1118",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveSection(item.id); setMobileOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold uppercase text-left"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.1em",
                color: activeSection === item.id ? "#c9961a" : "#9ca3af",
                background: activeSection === item.id ? "rgba(201,150,26,0.07)" : "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ── HOME ── */}
      {activeSection === "home" && (
        <div>
          {/* Hero */}
          <div
            className="relative flex flex-col items-center justify-center text-center overflow-hidden"
            style={{ minHeight: "520px" }}
          >
            {/* Stadium bg */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=1600&h=900&fit=crop&auto=format)`,
                filter: "brightness(0.18) saturate(0.4)",
              }}
            />
            {/* Gradient overlay */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center top, rgba(201,150,26,0.08) 0%, transparent 60%), linear-gradient(180deg, transparent 60%, #07090e 100%)",
              }}
            />
            {/* Gold rule top */}
            <div
              className="absolute top-0 inset-x-0 h-0.5"
              style={{ background: "linear-gradient(90deg, transparent, #c9961a, transparent)" }}
            />

            <div className="relative z-10 flex flex-col items-center px-4 pt-16 pb-12">
              <div
                className="text-xs font-bold tracking-widest uppercase mb-4"
                style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.3em" }}
              >
                {SEASON} Fantasy Football Season
              </div>
              <h1
                className="text-6xl md:text-8xl font-black uppercase leading-none mb-2"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}
              >
                {TEAM_NAME}
              </h1>
              <div
                className="h-0.5 w-24 my-5"
                style={{ background: "linear-gradient(90deg, transparent, #c9961a, transparent)" }}
              />
              <p className="text-base max-w-md" style={{ color: "#9ca3af" }}>
                Building a dynasty one pick at a time. Season 1 kicks off soon — are you ready?
              </p>
            </div>
          </div>

          {/* Draft countdown */}
          <div className="flex flex-col items-center px-4 pb-16 -mt-4">
            <div
              className="w-full max-w-3xl p-8 md:p-12"
              style={{
                background: "linear-gradient(160deg, #0e1118, #0a0e16)",
                border: "1px solid rgba(201,150,26,0.2)",
              }}
            >
              <div className="flex items-center gap-2 mb-6 justify-center">
                <Clock size={16} style={{ color: "#c9961a" }} />
                <span
                  className="text-sm font-bold uppercase tracking-widest"
                  style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.25em" }}
                >
                  Season 1 Kickoff
                </span>
              </div>
              <div className="grid grid-cols-2 justify-items-center gap-5 md:flex md:justify-center md:gap-6">
                <CountdownBlock value={countdown.days} label="Days" />
                <div className="hidden md:flex items-center text-3xl font-black pb-6" style={{ color: "rgba(201,150,26,0.4)", fontFamily: "'Barlow Condensed', sans-serif" }}>:</div>
                <CountdownBlock value={countdown.hours} label="Hours" />
                <div className="hidden md:flex items-center text-3xl font-black pb-6" style={{ color: "rgba(201,150,26,0.4)", fontFamily: "'Barlow Condensed', sans-serif" }}>:</div>
                <CountdownBlock value={countdown.minutes} label="Minutes" />
                <div className="hidden md:flex items-center text-3xl font-black pb-6" style={{ color: "rgba(201,150,26,0.4)", fontFamily: "'Barlow Condensed', sans-serif" }}>:</div>
                <CountdownBlock value={countdown.seconds} label="Seconds" />
              </div>
              <div className="text-center mt-8">
                <p className="text-sm" style={{ color: "#6b7280" }}>
                  Kickoff · Wednesday, September 9, 2026 · 8:20 PM ET
                </p>
              </div>
            </div>

            {/* Quick nav cards */}
            <div className="w-full max-w-3xl mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Meet the Team", desc: "View your future roster", section: "roster" as NavSection, icon: <Users size={22} /> },
                { label: "News & Rumors", desc: "Latest player updates", section: "news" as NavSection, icon: <Newspaper size={22} /> },
                { label: "Scoreboard", desc: "Weekly matchup results", section: "scoreboard" as NavSection, icon: <BarChart3 size={22} /> },
              ].map((card) => (
                <button
                  key={card.section}
                  onClick={() => setActiveSection(card.section)}
                  className="group flex flex-col gap-2 p-5 text-left transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "linear-gradient(160deg, #0e1118, #0a0e16)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ color: "#c9961a" }}>{card.icon}</div>
                  <div
                    className="text-base font-black uppercase"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em" }}
                  >
                    {card.label}
                  </div>
                  <div className="text-xs" style={{ color: "#6b7280" }}>
                    {card.desc}
                  </div>
                  <ChevronRight size={14} className="mt-1 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: "#c9961a" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ROSTER ── */}
      {activeSection === "roster" && (ROSTER_ENABLED ? (
        <div>
          {/* Section header */}
          <div
            className="relative flex flex-col items-center justify-center text-center py-20 overflow-hidden"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: `url(${playerImg1})`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
                filter: "blur(8px) grayscale(1)",
              }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #07090e 0%, transparent 40%, #07090e 100%)" }} />
            <div className="relative z-10">
              <div
                className="text-xs font-bold tracking-widest uppercase mb-3"
                style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.35em" }}
              >
                {SEASON} Season · {TEAM_NAME}
              </div>
              <h2
                className="text-6xl md:text-8xl font-black uppercase leading-none"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Meet the Team
              </h2>
              <div className="h-0.5 w-24 mx-auto mt-5" style={{ background: "linear-gradient(90deg, transparent, #c9961a, transparent)" }} />
              <p className="mt-5 max-w-md mx-auto text-sm leading-relaxed" style={{ color: "#6b7280" }}>
                16 roster spots. 1 draft. Every position below is a declaration of intent — Season 1 kicks off September 9th.
              </p>
            </div>
          </div>

          {/* Player scroll sections */}
          {ROSTER_SLOTS.map((slot, i) => (
            <RosterPlayerSection key={i} slot={slot} index={i} />
          ))}

          {/* Footer cap */}
          <div
            className="flex flex-col items-center py-16 gap-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.3em" }}
            >
              16 Positions · Kickoff Sep 9
            </div>
            <p className="text-xs text-center max-w-xs" style={{ color: "#374151" }}>
              Roster will be updated live following the draft
            </p>
          </div>
        </div>
      ) : (
        <ComingSoon />
      ))}

      {/* ── NEWS ── */}
      {activeSection === "news" && (
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="mb-10">
            <div
              className="text-xs font-bold tracking-widest uppercase mb-2"
              style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.3em" }}
            >
              Around the League
            </div>
            <h2
              className="text-5xl md:text-6xl font-black uppercase leading-none"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              News &amp; Rumors
            </h2>
            <div className="h-0.5 w-16 mt-4" style={{ background: "#c9961a" }} />
            <p className="mt-4 text-sm" style={{ color: "#6b7280" }}>
              Stay ahead of the wire. Updated daily with the latest intel on top fantasy assets.
            </p>
          </div>

          {/* Filter tabs */}
          <div
            className="flex gap-1 mb-6 p-1"
            style={{ background: "#0e1118", border: "1px solid rgba(255,255,255,0.07)", display: "inline-flex" }}
          >
            {(["ALL", "NEWS", "RUMOR", "INJURY"] as const).map((tag) => (
              <button
                key={tag}
                onClick={() => setNewsFilter(tag)}
                className="px-4 py-1.5 text-xs font-bold uppercase transition-colors duration-150"
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: "0.1em",
                  background: tag === newsFilter ? "#c9961a" : "none",
                  color: tag === newsFilter ? "#07090e" : "#6b7280",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {tag}
              </button>
            ))}
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            {filteredNews.length > 0 ? (
              filteredNews.map((item) => (
                <NewsCard key={`${item.published}|${item.headline}`} item={item} />
              ))
            ) : (
              <p className="text-center text-sm p-8" style={{ color: "#4b5563" }}>
                No {EMPTY_LABEL[newsFilter]} right now.
              </p>
            )}
          </div>

          <p
            className="text-center text-xs mt-6"
            style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {isLive
              ? "Live player news via ESPN"
              : "Backend offline · start the Python API to load live news"}
          </p>
        </div>
      )}

      {/* ── SCOREBOARD ── */}
      {activeSection === "scoreboard" && (selectedWeek != null ? (
        <WeekDetailView
          week={selectedWeek}
          matchup={matchup}
          loading={matchupLoading}
          onBack={() => setSelectedWeek(null)}
        />
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="mb-10">
            <div
              className="text-xs font-bold tracking-widest uppercase mb-2"
              style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.3em" }}
            >
              {SEASON} Season
            </div>
            <h2
              className="text-5xl md:text-6xl font-black uppercase leading-none"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              Scoreboard
            </h2>
            <div className="h-0.5 w-16 mt-4" style={{ background: "#c9961a" }} />
            <p className="mt-4 text-sm" style={{ color: "#6b7280" }}>
              Weekly matchup results.
            </p>
          </div>

          {/* Season record */}
          <div
            className="flex items-center gap-4 md:gap-8 px-4 md:px-6 py-5 mb-6"
            style={{
              background: "linear-gradient(135deg, #0e1118, #0a0e16)",
              border: "1px solid rgba(201,150,26,0.2)",
            }}
          >
            <div className="text-center">
              <div
                className="text-4xl font-black"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#22c55e" }}
              >
                {team?.wins ?? 0}
              </div>
              <div className="text-xs uppercase tracking-wider mt-1" style={{ color: "#6b7280", fontFamily: "'Barlow Condensed', sans-serif" }}>
                Wins
              </div>
            </div>
            <div className="h-8 w-px" style={{ background: "rgba(255,255,255,0.07)" }} />
            <div className="text-center">
              <div
                className="text-4xl font-black"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#ef4444" }}
              >
                {team?.losses ?? 0}
              </div>
              <div className="text-xs uppercase tracking-wider mt-1" style={{ color: "#6b7280", fontFamily: "'Barlow Condensed', sans-serif" }}>
                Losses
              </div>
            </div>
            {(team?.ties ?? 0) > 0 && (
              <>
                <div className="h-8 w-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className="text-center">
                  <div
                    className="text-4xl font-black"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#9ca3af" }}
                  >
                    {team?.ties ?? 0}
                  </div>
                  <div className="text-xs uppercase tracking-wider mt-1" style={{ color: "#6b7280", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Ties
                  </div>
                </div>
              </>
            )}
            <div className="h-8 w-px" style={{ background: "rgba(255,255,255,0.07)" }} />
            <div className="flex-1 text-right">
              <div
                className="text-xs font-bold uppercase"
                style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.1em" }}
              >
                {team?.teamName ?? TEAM_NAME}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#4b5563" }}>
                {isLive ? `Season record · ${SEASON}` : "Season record · Pre-draft"}
              </div>
            </div>
          </div>

          {/* Matchups */}
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={13} style={{ color: "#c9961a" }} />
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "#c9961a", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.2em" }}
            >
              Season Schedule
            </span>
          </div>
          <div className="space-y-3">
            {schedule.map((match, i) => {
              const showOdds = match.weekNum === activeOddsWeek;
              return (
                <div
                  key={i}
                  className="overflow-hidden rounded-md"
                  style={{
                    background: "#0e1118",
                    border: showOdds
                      ? "1px solid rgba(201,150,26,0.35)"
                      : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <ScoreboardRow match={match} onOpen={() => setSelectedWeek(match.weekNum)} />
                  {showOdds && <WeekOddsDropdown weekNum={match.weekNum} />}
                </div>
              );
            })}
          </div>

          <div
            className="flex items-center gap-2 mt-6 p-4"
            style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.15)",
            }}
          >
            <Info size={14} style={{ color: "#60a5fa" }} />
            <p className="text-xs" style={{ color: "#6b7280" }}>
              {isLive
                ? "Connected to ESPN · Scores and records update automatically each week."
                : "Live scores will populate here once the Python backend is running and your ESPN league is configured."}
            </p>
          </div>
        </div>
      ))}

      {/* Footer */}
      <footer
        className="mt-16 px-6 py-8 text-center"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="text-sm font-black uppercase tracking-widest mb-1"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "#374151" }}
        >
          {TEAM_NAME} · {SEASON}
        </div>
        <div className="text-xs" style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}>
          Fantasy Football
        </div>
      </footer>
    </div>
  );
}
