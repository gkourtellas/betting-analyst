export type SportId = "football" | "basketball";

// Adding a new sport = add one entry here. Everything else (fetchers, market
// parsing, scoring, parlay logic) reads from this config instead of
// hardcoding a sport anywhere.
export interface SportDef {
  id: SportId;
  label: string;
  matchbookSportNames: string[]; // exact names to match in Matchbook's sports lookup
  oddsApiLeagueKeys: string[]; // The Odds API sport_key values
  oddsApiSportPrefix: string; // sport_key prefix used to sanity-check results, e.g. "soccer" / "basketball"
  totalsUnit: string; // "Goals" | "Points"
  hasDraw: boolean; // whether the match-result market can have a draw outcome
  hasBtts: boolean; // whether "Both Teams To Score" applies to this sport
}

export const SPORTS: Record<SportId, SportDef> = {
  football: {
    id: "football",
    label: "Football",
    matchbookSportNames: ["Soccer", "Football"],
    oddsApiLeagueKeys: [
      "soccer_uefa_champs_league",
      "soccer_epl",
      "soccer_spain_la_liga",
      "soccer_italy_serie_a",
      "soccer_germany_bundesliga",
      "soccer_france_ligue_one",
      "soccer_greece_super_league",
      "soccer_usa_mls",
      "soccer_portugal_primeira_liga",
      "soccer_netherlands_eredivisie",
      "soccer_sweden_superettan",
      "soccer_norway_eliteserien",
      "soccer_finland_veikkausliiga",
      "soccer_saudi_arabia_pro_league",
      "soccer_conmebol_copa_libertadores",
      "soccer_conmebol_copa_sudamericana",
      "soccer_brazil_campeonato",
      "soccer_brazil_serie_b",
      "soccer_efl_champ",
      "soccer_england_efl_cup",
      "soccer_spl",
    ],
    oddsApiSportPrefix: "soccer",
    totalsUnit: "Goals",
    hasDraw: true,
    hasBtts: true,
  },
  basketball: {
    id: "basketball",
    label: "Basketball",
    matchbookSportNames: ["Basketball"],
    oddsApiLeagueKeys: [
      "basketball_nba",
      "basketball_wnba",
      "basketball_ncaab",
      "basketball_euroleague",
      "basketball_nbl",
    ],
    oddsApiSportPrefix: "basketball",
    totalsUnit: "Points",
    hasDraw: false,
    hasBtts: false,
  },
};

export interface Config {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  ODDS_API_KEY: string;
  MATCHBOOK_USERNAME: string;
  MATCHBOOK_PASSWORD: string;
  MIN_CONFIDENCE_SCORE: number;
  MIN_ESTIMATED_PROBABILITY: number;
  MAX_ACCEPTABLE_ODDS: number;
  MIN_ACCEPTABLE_ODDS: number;
  MAX_OVERROUND: number;
  TIME_WINDOW_HOURS: number;
}

export interface PickItem {
  sport: string;
  league: string;
  event: string;
  home_team: string;
  away_team: string;
  event_time: string;
  market: string;
  tip: string;
  odds: string;
  numeric_odds: number;
  confidence_score: number;
  estimated_probability: number;
  overround_pct: number;
  why: string[];
}

export interface AnalysisData {
  status: "THREE_LEG_PARLAY" | "TWO_LEG_PARLAY" | "SINGLE_BET" | "NO_BET";
  parlay_type: string;
  combined_odds: number;
  picks: PickItem[];
  all_qualified_picks?: PickItem[];
  correlation_warning?: string;
}

export interface ExecutionResult {
  success: boolean;
  data: AnalysisData;
  telegramText: string;
  logs: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function getAthensDateStr(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Athens",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().split("T")[0];
  }
}

function getAthensTimestamp(): string {
  try {
    return new Date().toLocaleString("en-GB", { timeZone: "Europe/Athens" }) + " (Athens)";
  } catch (e) {
    return new Date().toISOString();
  }
}

function formatAthensTime(utc_dt: Date): string {
  try {
    return utc_dt
      .toLocaleString("en-GB", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", "");
  } catch (e) {
    return utc_dt.toISOString();
  }
}

// ---------------------------------------------------------------------------
// De-vig: strip bookmaker margin from an N-way market so odds -> fair probs.
// ---------------------------------------------------------------------------

function devig(prices: number[]): { probs: number[]; overround_pct: number } {
  const raw = prices.map((p) => 1 / p);
  const total = raw.reduce((a, b) => a + b, 0);
  const overround_pct = Math.round((total - 1) * 10000) / 100;
  return { probs: raw.map((r) => r / total), overround_pct };
}

// ---------------------------------------------------------------------------
// Candidate leg: one possible bet on one match, from one market.
// Every outcome of every market we have data for becomes a candidate — the
// engine no longer hardcodes "favorite always wins". Whichever candidate has
// the best qualifying fair probability wins that match's slot.
// ---------------------------------------------------------------------------

interface Candidate {
  market: string;
  selection: string;
  odds: number;
  fair_prob: number;
  overround_pct: number;
  group_desc: string;
}

function buildCandidates(match: any): Candidate[] {
  const candidates: Candidate[] = [];
  const unit = match.totals_unit || "Goals"; // "Goals" (football) or "Points" (basketball)

  // Match result — 3-way (football, has a draw) or 2-way (basketball moneyline, no draw).
  // Whichever fields the fetcher populated decides the shape; no sport hardcoding here.
  if (match.odds_home && match.odds_draw && match.odds_away) {
    const { probs, overround_pct } = devig([match.odds_home, match.odds_draw, match.odds_away]);
    const desc = `1X2 market (${match.home_team} / Draw / ${match.away_team})`;
    candidates.push({ market: "Match Result", selection: `${match.home_team} to win`, odds: match.odds_home, fair_prob: probs[0], overround_pct, group_desc: desc });
    candidates.push({ market: "Match Result", selection: "Draw", odds: match.odds_draw, fair_prob: probs[1], overround_pct, group_desc: desc });
    candidates.push({ market: "Match Result", selection: `${match.away_team} to win`, odds: match.odds_away, fair_prob: probs[2], overround_pct, group_desc: desc });
  } else if (match.odds_home && match.odds_away) {
    const { probs, overround_pct } = devig([match.odds_home, match.odds_away]);
    const desc = `Moneyline market (${match.home_team} / ${match.away_team})`;
    candidates.push({ market: "Match Result", selection: `${match.home_team} to win`, odds: match.odds_home, fair_prob: probs[0], overround_pct, group_desc: desc });
    candidates.push({ market: "Match Result", selection: `${match.away_team} to win`, odds: match.odds_away, fair_prob: probs[1], overround_pct, group_desc: desc });
  }

  // Totals (Over/Under) — two-way market at whatever line the book quoted.
  if (match.totals_point != null && match.odds_over && match.odds_under) {
    const { probs, overround_pct } = devig([match.odds_over, match.odds_under]);
    const desc = `Totals market @ ${match.totals_point} ${unit.toLowerCase()}`;
    candidates.push({ market: `Total ${unit}`, selection: `Over ${match.totals_point}`, odds: match.odds_over, fair_prob: probs[0], overround_pct, group_desc: desc });
    candidates.push({ market: `Total ${unit}`, selection: `Under ${match.totals_point}`, odds: match.odds_under, fair_prob: probs[1], overround_pct, group_desc: desc });
  }

  // Both Teams To Score — football-only market. Only present when the fetcher
  // populated it (basketball fetchers never set these fields).
  if (match.odds_btts_yes && match.odds_btts_no) {
    const { probs, overround_pct } = devig([match.odds_btts_yes, match.odds_btts_no]);
    candidates.push({ market: "Both Teams To Score", selection: "Yes", odds: match.odds_btts_yes, fair_prob: probs[0], overround_pct, group_desc: "BTTS market" });
    candidates.push({ market: "Both Teams To Score", selection: "No", odds: match.odds_btts_no, fair_prob: probs[1], overround_pct, group_desc: "BTTS market" });
  }

  return candidates;
}

function analyzeMatch(match: any, config: Config, logs: string[]): PickItem | null {
  const candidates = buildCandidates(match);
  if (candidates.length === 0) {
    logs.push(`Match ${match.home_team} vs ${match.away_team} discarded: no usable market data`);
    return null;
  }

  let best: Candidate | null = null;
  for (const c of candidates) {
    if (c.odds < config.MIN_ACCEPTABLE_ODDS || c.odds > config.MAX_ACCEPTABLE_ODDS) continue;
    if (c.overround_pct > config.MAX_OVERROUND) continue;
    if (c.fair_prob < config.MIN_ESTIMATED_PROBABILITY) continue;
    if (!best || c.fair_prob > best.fair_prob) best = c;
  }

  if (!best) {
    logs.push(
      `Match ${match.home_team} vs ${match.away_team} discarded: no market/outcome cleared odds range, overround or probability thresholds`
    );
    return null;
  }

  const score = Math.max(1, Math.min(10, Math.round(best.fair_prob * 1000) / 100));
  if (score < config.MIN_CONFIDENCE_SCORE) {
    logs.push(`Match ${match.home_team} vs ${match.away_team} discarded: confidence score ${score.toFixed(2)} below threshold ${config.MIN_CONFIDENCE_SCORE}`);
    return null;
  }

  logs.push(
    `Match ${match.home_team} vs ${match.away_team}: best leg = ${best.market} / ${best.selection} @ ${best.odds} ` +
      `fair_prob=${(best.fair_prob * 100).toFixed(1)}% overround=${best.overround_pct}%`
  );

  const why_lines = [
    `${best.group_desc}: ${best.selection} @ ${best.odds.toFixed(2)} implies ${(best.fair_prob * 100).toFixed(1)}% fair probability after removing bookmaker margin (${best.overround_pct}% overround).`,
    `This was the highest-probability qualifying outcome across all markets checked for this match (Match Result, Total Goals, Both Teams To Score, depending on data available) — not automatically the favorite.`,
    `Pure market-price read. No form/injury/weather data feed is connected.`,
  ];

  return {
    sport: match.sport_id || "football",
    league: match.league,
    event: `${match.home_team} vs ${match.away_team}`,
    home_team: match.home_team,
    away_team: match.away_team,
    event_time: `${match.match_time_athens} (Athens time)`,
    market: best.market,
    tip: best.selection,
    odds: best.odds.toFixed(2),
    numeric_odds: best.odds,
    confidence_score: score,
    estimated_probability: Math.round(best.fair_prob * 100) / 100,
    overround_pct: best.overround_pct,
    why: why_lines,
  };
}

function selectParlays(analyzedPicks: PickItem[], logs: string[]): AnalysisData {
  const sortedPicks = [...analyzedPicks].sort((a, b) => b.confidence_score - a.confidence_score);
  const count = sortedPicks.length;
  logs.push(`Found ${count} qualifying picks across all markets.`);

  const correlation_warning =
    "Combined odds assume each leg is independent. Real matches are not independent " +
    "(shared kickoff windows, correlated market moves) — true parlay win probability is " +
    "usually lower than the naive product of individual odds suggests.";

  if (count === 0) {
    return { status: "NO_BET", picks: [], parlay_type: "NO BET", combined_odds: 0.0 };
  } else if (count === 1) {
    return {
      status: "SINGLE_BET",
      picks: sortedPicks.slice(0, 1),
      parlay_type: "Single Bet",
      combined_odds: sortedPicks[0].numeric_odds,
    };
  } else if (count === 2) {
    const combined = Math.round(sortedPicks[0].numeric_odds * sortedPicks[1].numeric_odds * 100) / 100;
    return {
      status: "TWO_LEG_PARLAY",
      picks: sortedPicks.slice(0, 2),
      parlay_type: "2-leg parlay",
      combined_odds: combined,
      correlation_warning,
    };
  } else {
    const top3 = sortedPicks.slice(0, 3);
    const combined = Math.round(top3[0].numeric_odds * top3[1].numeric_odds * top3[2].numeric_odds * 100) / 100;
    return {
      status: "THREE_LEG_PARLAY",
      picks: top3,
      parlay_type: "3-leg parlay",
      combined_odds: combined,
      correlation_warning,
    };
  }
}

function formatTelegramMessage(selectionResult: AnalysisData): string {
  const status = selectionResult.status;
  const picks = selectionResult.picks || [];
  const lines: string[] = ["DAILY FOOTBALL PICKS (Athens Time)", ""];

  if (status === "NO_BET" || picks.length === 0) {
    return (
      lines.join("\n") +
      "NO BET\n\n" +
      "No match/market cleared the odds, overround or probability thresholds today. Preserve capital and wait."
    );
  }

  picks.forEach((pick: any, i: number) => {
    lines.push(`${i + 1}. ${pick.event} (${pick.league || "Unknown League"})`);
    lines.push(`event time: ${pick.event_time}`);
    lines.push(`market: ${pick.market}`);
    lines.push(`tip: ${pick.tip}`);
    lines.push(`odds: ${pick.odds}`);
    lines.push(`fair (de-vigged) probability: ${(pick.estimated_probability * 100).toFixed(0)}%`);
    lines.push("why:");
    pick.why.forEach((reason: string) => lines.push(`- ${reason}`));
    lines.push("");
  });

  if (status === "SINGLE_BET") {
    lines.push(`Recommendation: Single Bet on ${picks[0].event} — ${picks[0].market}: ${picks[0].tip} @ ${picks[0].odds}.`);
  } else {
    lines.push(`Combined Odds (naive, assumes independence): ${selectionResult.combined_odds.toFixed(2)}`);
    if (selectionResult.correlation_warning) lines.push(selectionResult.correlation_warning);
  }

  return lines.join("\n").trim();
}

async function sendTelegramMessage(token: string, chatId: string, text: string, logs: string[]): Promise<boolean> {
  if (!token || !chatId) {
    logs.push("Telegram credentials not configured. Printing message to stdout/preview only.");
    return false;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    logs.push("Sending message to Telegram...");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const resData = (await response.json()) as any;
    if (resData.ok) {
      logs.push("Telegram message successfully delivered!");
      return true;
    }
    logs.push(`Telegram API returned error: ${JSON.stringify(resData)}`);
  } catch (err: any) {
    logs.push(`Network error sending to Telegram: ${err.message}`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fetch — real odds only. No demo/fallback fixtures anywhere.
// ---------------------------------------------------------------------------

function extractMarket(bookmaker: any, key: string): any | null {
  return bookmaker.markets?.find((m: any) => m.key === key) || null;
}

async function fetchFromOddsApi(sportDef: SportDef, config: Config, logs: string[]): Promise<any[]> {
  const matches: any[] = [];
  const rawData: any[] = [];
  const now = new Date();
  const windowMs = config.TIME_WINDOW_HOURS * 3600 * 1000;

  for (const league of sportDef.oddsApiLeagueKeys) {
    try {
      // Markets: h2h (match result) and totals (over/under). 'btts' commented out as it is not supported on this endpoint.
      const url = `https://api.the-odds-api.com/v4/sports/${league}/odds/?apiKey=${config.ODDS_API_KEY}&regions=eu&markets=h2h,totals`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        rawData.push(...((await res.json()) as any[]));
      } else {
        logs.push(`League ${league} returned non-ok status: ${res.status}`);
      }
    } catch (err: any) {
      logs.push(`Skipping league ${league} due to error: ${err.message}`);
    }
  }

  const seenIds = new Set<string>();
  for (const item of rawData) {
    if (!item.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    if (!item.sport_key?.startsWith(sportDef.oddsApiSportPrefix)) continue;

    const utc_dt = new Date(item.commence_time);
    const diffMs = utc_dt.getTime() - now.getTime();
    if (diffMs < 0 || diffMs > windowMs) continue;

    const bookmakers = item.bookmakers || [];
    if (bookmakers.length === 0) continue;
    const bm = bookmakers.find((b: any) => b.key === "pinnacle") || bookmakers[0];

    const home_team = item.home_team;
    const away_team = item.away_team;

    const match: any = {
      id: item.id,
      league: item.sport_title || "Unknown League",
      sport_id: sportDef.id,
      totals_unit: sportDef.totalsUnit,
      home_team,
      away_team,
      match_time_athens: formatAthensTime(utc_dt),
    };

    const h2h = extractMarket(bm, "h2h");
    if (h2h) {
      for (const o of h2h.outcomes || []) {
        const price = parseFloat(o.price);
        if (o.name === home_team) match.odds_home = price;
        else if (o.name === away_team) match.odds_away = price;
        else if (sportDef.hasDraw && o.name?.toLowerCase() === "draw") match.odds_draw = price;
      }
    }

    const totals = extractMarket(bm, "totals");
    if (totals && totals.outcomes?.length) {
      // Use the first line the book quotes (Odds API typically returns one main line).
      const over = totals.outcomes.find((o: any) => o.name?.toLowerCase() === "over");
      const under = totals.outcomes.find((o: any) => o.name?.toLowerCase() === "under");
      if (over && under && over.point != null) {
        match.totals_point = over.point;
        match.odds_over = parseFloat(over.price);
        match.odds_under = parseFloat(under.price);
      }
    }

    if (sportDef.hasBtts) {
      const btts = extractMarket(bm, "btts");
      if (btts) {
        const yes = btts.outcomes?.find((o: any) => o.name?.toLowerCase() === "yes");
        const no = btts.outcomes?.find((o: any) => o.name?.toLowerCase() === "no");
        if (yes && no) {
          match.odds_btts_yes = parseFloat(yes.price);
          match.odds_btts_no = parseFloat(no.price);
        }
      }
    }

    matches.push(match);
  }

  logs.push(`Successfully fetched ${matches.length} upcoming ${sportDef.label} matches from The Odds API.`);
  return matches;
}

// ---------------------------------------------------------------------------
// Matchbook — real authenticated exchange API.
// Docs: https://developers.matchbook.com/reference/login
// Login returns a session-token; every subsequent call sends it as a header.
// Sessions last ~6h, so one login covers a whole run (this app runs ~daily).
// No spoofed headers, no guessed internal endpoints — this is the documented
// public API, used the way Matchbook's own docs describe.
// ---------------------------------------------------------------------------

const MATCHBOOK_API_BASE = "https://api.matchbook.com";

async function matchbookLogin(config: Config, logs: string[]): Promise<string | null> {
  try {
    const res = await fetch(`${MATCHBOOK_API_BASE}/bpapi/rest/security/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        username: config.MATCHBOOK_USERNAME,
        password: config.MATCHBOOK_PASSWORD,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logs.push(`Matchbook login failed: HTTP ${res.status} ${body}`.trim());
      return null;
    }

    const data: any = await res.json().catch(() => ({}));
    const token = data["session-token"] || data.sessionToken || res.headers.get("session-token");
    if (!token) {
      logs.push("Matchbook login succeeded but no session-token was found in the response.");
      return null;
    }
    logs.push("Matchbook login successful, session established.");
    return token;
  } catch (err: any) {
    const causeDetail = err?.cause ? ` | cause: ${err.cause.code || err.cause.message || JSON.stringify(err.cause)}` : "";
    logs.push(`Matchbook login error: ${err.message}${causeDetail}`);
    return null;
  }
}

async function matchbookGetSportId(sessionToken: string, sportDef: SportDef, logs: string[]): Promise<string | null> {
  try {
    const res = await fetch(`${MATCHBOOK_API_BASE}/edge/rest/lookups/sports?per-page=100`, {
      headers: { "session-token": sessionToken, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logs.push(`Matchbook sports lookup failed: HTTP ${res.status}`);
      return null;
    }
    const data: any = await res.json().catch(() => ({}));
    const sports: any[] = data.sports || data.data || (Array.isArray(data) ? data : []);
    const wanted = sportDef.matchbookSportNames.map((n) => n.toLowerCase());
    const match = sports.find((s: any) => wanted.includes((s.name || "").toLowerCase()));
    if (!match) {
      logs.push(`Could not find a ${sportDef.matchbookSportNames.join("/")} entry in Matchbook's sports list.`);
      return null;
    }
    return String(match.id);
  } catch (err: any) {
    logs.push(`Matchbook sports lookup error: ${err.message}`);
    return null;
  }
}

function matchbookFindPrice(runner: any, side: "back" | "lay"): number | null {
  const prices = (runner?.prices || []).filter((p: any) => p.side === side);
  if (prices.length === 0) return null;
  // Prices come back best-first for a given side per the docs' price-depth ordering.
  const best = prices[0]["decimal-odds"];
  return best != null ? parseFloat(best) : null;
}

async function fetchFromMatchbook(sessionToken: string, sportDef: SportDef, config: Config, logs: string[]): Promise<any[]> {
  const matches: any[] = [];

  const sportId = await matchbookGetSportId(sessionToken, sportDef, logs);
  if (!sportId) return matches;

  const now = new Date();
  const windowMs = config.TIME_WINDOW_HOURS * 3600 * 1000;
  const afterEpoch = Math.floor(now.getTime() / 1000);
  const beforeEpoch = Math.floor((now.getTime() + windowMs) / 1000);

  const allEvents: any[] = [];
  const perPage = 100;
  let offset = 0;
  const MAX_PAGES = 5; // safety cap: 500 events, plenty for a daily scan

  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const url =
        `${MATCHBOOK_API_BASE}/edge/rest/events?` +
        `sport-ids=${sportId}&states=open&per-page=${perPage}&offset=${offset}` +
        `&after=${afterEpoch}&before=${beforeEpoch}` +
        `&include-prices=true&price-depth=1&odds-type=DECIMAL`;
      const res = await fetch(url, {
        headers: { "session-token": sessionToken, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        logs.push(`Matchbook events fetch failed at offset ${offset}: HTTP ${res.status}`);
        break;
      }
      const data: any = await res.json().catch(() => ({}));
      const events: any[] = data.events || data.data || (Array.isArray(data) ? data : []);
      allEvents.push(...events);
      if (events.length < perPage) break; // last page
      offset += perPage;
    } catch (err: any) {
      logs.push(`Matchbook events fetch error at offset ${offset}: ${err.message}`);
      break;
    }
  }

  logs.push(`Matchbook returned ${allEvents.length} open ${sportDef.label} events within the ${config.TIME_WINDOW_HOURS}h window.`);

  // Diagnostic: record every distinct market name Matchbook actually returns,
  // so you can check it against the names this parser looks for below
  // ("Match Odds", "Over/Under X Goals", "Both Teams To Score") instead of
  // guessing why a match got dropped.
  const marketNameCounts = new Map<string, number>();
  let eventsWithH2H = 0;
  let eventsWithTotals = 0;
  let eventsWithBtts = 0;
  let eventsWithNoParsableName = 0;

  for (const ev of allEvents) {
    const name: string = ev.name || "";
    if (!name.includes(" v ") && !name.includes(" vs ")) {
      eventsWithNoParsableName++;
      continue;
    }
    const parts = name.split(/ v | vs /);
    const home_team = parts[0]?.trim();
    const away_team = parts[1]?.trim();
    if (!home_team || !away_team) continue;

    const utc_dt = new Date(ev["start"] || ev["start-time"]);
    if (isNaN(utc_dt.getTime())) continue;

    const compTag = (ev["meta-tags"] || []).find((t: any) => t.type === "COMPETITION");
    const league = compTag?.name || `Matchbook ${sportDef.label}`;

    const match: any = {
      id: String(ev.id),
      league,
      sport_id: sportDef.id,
      totals_unit: sportDef.totalsUnit,
      home_team,
      away_team,
      match_time_athens: formatAthensTime(utc_dt),
    };

    for (const m of ev.markets || []) {
      const raw_name: string = m.name || "(unnamed market)";
      marketNameCounts.set(raw_name, (marketNameCounts.get(raw_name) || 0) + 1);
      const m_name: string = raw_name.toLowerCase();
      const runners = m.runners || [];

      // Match result — "Match Odds" on football, "Moneyline" on basketball.
      // 3-way for football (has a draw runner) or 2-way for basketball.
      if (m_name === "match odds" || m_name === "moneyline") {
        for (const r of runners) {
          const r_name = (r.name || "").trim();
          const back = matchbookFindPrice(r, "back");
          if (back == null) continue;
          if (r_name === home_team) match.odds_home = back;
          else if (r_name === away_team) match.odds_away = back;
          else if (sportDef.hasDraw && (r_name.toLowerCase() === "the draw" || r_name.toLowerCase() === "draw")) match.odds_draw = back;
        }
        const h2hComplete = sportDef.hasDraw
          ? match.odds_home && match.odds_draw && match.odds_away
          : match.odds_home && match.odds_away;
        if (h2hComplete) eventsWithH2H++;
      }

      // Totals — Matchbook names the market plainly "Total"; the line
      // (e.g. 2.5 goals, 220.5 points) is embedded in each runner's name
      // ("Over 2.5" / "Under 2.5"), not in the market name itself.
      if (m_name === "total" && !match.odds_over) {
        const over_r = runners.find((r: any) => /^over\b/i.test(r.name || ""));
        const under_r = runners.find((r: any) => /^under\b/i.test(r.name || ""));
        const lineMatch = (over_r?.name || "").match(/[\d.]+/);
        if (over_r && under_r && lineMatch) {
          const over_back = matchbookFindPrice(over_r, "back");
          const under_back = matchbookFindPrice(under_r, "back");
          if (over_back != null && under_back != null) {
            match.totals_point = parseFloat(lineMatch[0]);
            match.odds_over = over_back;
            match.odds_under = under_back;
            eventsWithTotals++;
          }
        }
      }

      // BTTS — football-only market, skipped entirely for sports where it doesn't apply.
      if (sportDef.hasBtts && m_name === "both teams to score") {
        const yes_r = runners.find((r: any) => (r.name || "").toLowerCase() === "yes");
        const no_r = runners.find((r: any) => (r.name || "").toLowerCase() === "no");
        const yes_back = yes_r ? matchbookFindPrice(yes_r, "back") : null;
        const no_back = no_r ? matchbookFindPrice(no_r, "back") : null;
        if (yes_back != null && no_back != null) {
          match.odds_btts_yes = yes_back;
          match.odds_btts_no = no_back;
          eventsWithBtts++;
        }
      }
    }

    matches.push(match);
  }

  if (eventsWithNoParsableName > 0) {
    logs.push(`${eventsWithNoParsableName} events skipped: name field didn't match the expected "Team A v Team B" format.`);
  }
  logs.push(
    `Market data found — 1X2: ${eventsWithH2H}/${allEvents.length} events, Totals: ${eventsWithTotals}/${allEvents.length} events, BTTS: ${eventsWithBtts}/${allEvents.length} events.`
  );
  const topMarketNames = [...marketNameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  logs.push(
    `Distinct market names seen from Matchbook (top 15): ${topMarketNames.map(([n, c]) => `"${n}" x${c}`).join(", ") || "(none — events had no markets array)"}`
  );
  logs.push(`Built ${matches.length} match objects total (includes ones with zero usable market data — those get discarded next, in analyzeMatch, with a per-match reason).`);
  return matches;
}

const VALID_TIME_WINDOWS = [3, 6, 9, 12, 15, 18];
export type SportSelection = SportId | "all";

export async function runDailyAnalysisPureTS(
  dryRun: boolean = true,
  timeWindowHours?: number,
  sportSelection: SportSelection = "football"
): Promise<ExecutionResult> {
  const logs: string[] = [];
  logs.push(`Starting Daily Football Betting Analysis on ${getAthensTimestamp()}...`);

  const requestedWindow = timeWindowHours ?? parseFloat(process.env.TIME_WINDOW_HOURS || "18");
  const resolvedWindow = VALID_TIME_WINDOWS.includes(requestedWindow) ? requestedWindow : 18;
  if (requestedWindow !== resolvedWindow) {
    logs.push(`Requested time window ${requestedWindow}h is not one of ${VALID_TIME_WINDOWS.join("/")}h — defaulting to 18h.`);
  }
  logs.push(`Scanning for kickoffs within the next ${resolvedWindow}h.`);

  const config: Config = {
    TELEGRAM_BOT_TOKEN: (process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    TELEGRAM_CHAT_ID: (process.env.TELEGRAM_CHAT_ID || "").trim(),
    ODDS_API_KEY: (process.env.ODDS_API_KEY || "").trim(),
    MATCHBOOK_USERNAME: (process.env.MATCHBOOK_USERNAME || "").trim(),
    MATCHBOOK_PASSWORD: (process.env.MATCHBOOK_PASSWORD || "").trim(),
    MIN_CONFIDENCE_SCORE: parseFloat(process.env.MIN_CONFIDENCE_SCORE || "7.2"),
    MIN_ESTIMATED_PROBABILITY: parseFloat(process.env.MIN_ESTIMATED_PROBABILITY || "0.62"),
    MAX_ACCEPTABLE_ODDS: parseFloat(process.env.MAX_ACCEPTABLE_ODDS || "2.10"),
    MIN_ACCEPTABLE_ODDS: parseFloat(process.env.MIN_ACCEPTABLE_ODDS || "1.30"),
    MAX_OVERROUND: parseFloat(process.env.MAX_OVERROUND || "8.0"),
    TIME_WINDOW_HOURS: resolvedWindow,
  };

  const requestedSports: SportId[] = sportSelection === "all" ? (["football", "basketball"] as SportId[]) : [sportSelection];
  logs.push(`Scanning sport(s): ${requestedSports.map((s) => SPORTS[s].label).join(", ")}.`);

  // Matchbook sessions last ~6h — log in once here and reuse the token across
  // every sport in this run instead of one login per sport.
  let sessionToken: string | null = null;
  if (config.MATCHBOOK_USERNAME && config.MATCHBOOK_PASSWORD) {
    logs.push("Logging into Matchbook exchange (authenticated API)...");
    sessionToken = await matchbookLogin(config, logs);
  } else {
    logs.push("No MATCHBOOK_USERNAME/MATCHBOOK_PASSWORD configured — skipping Matchbook.");
  }

  const qualified_picks: PickItem[] = [];

  for (const sportId of requestedSports) {
    const sportDef = SPORTS[sportId];
    let matches: any[] = [];

    if (sessionToken) {
      logs.push(`--- ${sportDef.label}: fetching from Matchbook ---`);
      matches = await fetchFromMatchbook(sessionToken, sportDef, config, logs);
    }

    if (matches.length === 0 && config.ODDS_API_KEY) {
      logs.push(`--- ${sportDef.label}: no Matchbook matches, falling back to The Odds API ---`);
      matches = await fetchFromOddsApi(sportDef, config, logs);
    }

    if (matches.length === 0) {
      logs.push(`No live ${sportDef.label} matches retrieved for the configured window/leagues.`);
    }

    for (const match of matches) {
      const pick = analyzeMatch(match, config, logs);
      if (pick) qualified_picks.push(pick);
    }
  }

  const analysisResult = selectParlays(qualified_picks, logs);
  analysisResult.all_qualified_picks = qualified_picks;

  const telegramMessage = formatTelegramMessage(analysisResult);

  if (!dryRun) {
    await sendTelegramMessage(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID, telegramMessage, logs);
  } else {
    logs.push("Dry-run mode enabled. Telegram dispatch skipped.");
  }

  logs.push("Daily analysis completed successfully.");

  return {
    success: true,
    data: analysisResult,
    telegramText: telegramMessage,
    logs: logs.join("\n"),
    timestamp: new Date().toISOString(),
  };
}
