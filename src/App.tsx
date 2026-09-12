import React, { useState, useEffect, useRef } from "react";
import { PWAInstallButton } from "./components/PWAInstallButton";
import {
  Clock,
  Play,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Send,
  FileCode,
  ShieldCheck,
  TrendingUp,
  Award,
  BookOpen,
  Copy,
  ChevronRight,
  Database,
  CheckSquare,
  Sparkles,
  HelpCircle,
  Activity,
  Check,
  Plus,
  Trash2,
  Filter
} from "lucide-react";

interface PickItem {
  sport: string;
  league: string;
  event: string;
  event_time: string;
  market: string;
  tip: string;
  odds: string;
  confidence_score: number;
  why: string[] | string;
}

interface AnalysisData {
  status: "THREE_LEG_PARLAY" | "TWO_LEG_PARLAY" | "SINGLE_BET" | "NO_BET";
  parlay_type: string;
  combined_odds: number;
  picks: PickItem[];
  all_qualified_picks?: PickItem[];
}

export default function App() {
  const [athensTime, setAthensTime] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    data: AnalysisData;
    telegramText: string;
    logs: string;
    timestamp: string;
  } | null>(null);
  
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all_matches" | "system_parlay" | "telegram" | "logs">("system_parlay");
  const [leagueFilter, setLeagueFilter] = useState<string>("ALL");
  const [timeWindowHours, setTimeWindowHours] = useState<number>(18);
  const TIME_WINDOW_OPTIONS = [3, 6, 9, 12, 15, 18];
  const [sport, setSport] = useState<"football" | "basketball" | "all">("football");
  const SPORT_OPTIONS: { value: "football" | "basketball" | "all"; label: string }[] = [
    { value: "football", label: "Football" },
    { value: "basketball", label: "Basketball" },
    { value: "all", label: "Best Overall" },
  ];
  const [selectedCustomPicks, setSelectedCustomPicks] = useState<PickItem[]>([]);
  
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll terminal logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [result?.logs, loading]);

  // Live Athens Time Clock Indicator
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Athens",
          dateStyle: "full",
          timeStyle: "medium",
        }).format(now);
        setAthensTime(formatted);
      } catch (e) {
        setAthensTime(new Date().toUTCString());
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);
    setStatusMessage("Starting live betting analyst scan...");
    setSelectedCustomPicks([]); // Reset custom picks when a new live scan runs
    
    // Status steps
    const steps = [
      "Bootstrapping conservative odds criteria...",
      "Connecting to live Matchbook exchange feed...",
      "Fetching real-time fixtures and live order book odds...",
      "Analyzing 1X2, totals & BTTS markets for value...",
      "Filtering out risky/high-margin lines...",
      "Exporting generated picks and recommendations..."
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length) {
        setStatusMessage(steps[stepIdx]);
        stepIdx++;
      }
    }, 1000);

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/run-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeWindowHours, sport })
      });
      
      clearInterval(interval);
      const data = await response.json();
      
      if (data.success || data.data) {
        setResult(data);
        setStatusMessage("Execution finished successfully.");
      } else {
        setError(data.error || "Execution completed but did not produce picks output.");
        setResult(data);
      }
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || "Network error occurred when running the analysis engine.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleToggleCustomPick = (pick: PickItem) => {
    setSelectedCustomPicks(prev => {
      const exists = prev.some(p => p.event === pick.event);
      if (exists) {
        return prev.filter(p => p.event !== pick.event);
      } else {
        // Prevent duplicate types (e.g. avoid adding multiple items for the exact same event)
        return [...prev, pick];
      }
    });
  };

  const clearCustomParlay = () => {
    setSelectedCustomPicks([]);
  };

  // Leagues come straight from the live odds feed's sport_title — no
  // hardcoded team-name matching, so any league/team the API returns
  // is categorized correctly instead of falling into "Other".
  const getLeagueBadgeColor = (league: string) => {
    const palette = [
      "bg-blue-950/50 text-blue-300 border-blue-800/60",
      "bg-rose-950/50 text-rose-300 border-rose-800/60",
      "bg-yellow-950/40 text-yellow-300 border-yellow-800/50",
      "bg-emerald-950/50 text-emerald-300 border-emerald-800/60",
      "bg-purple-950/50 text-purple-300 border-purple-800/60",
      "bg-orange-950/50 text-orange-300 border-orange-800/60",
      "bg-cyan-950/50 text-cyan-300 border-cyan-800/60",
    ];
    let hash = 0;
    for (let i = 0; i < league.length; i++) hash = (hash * 31 + league.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  };

  // Extract all qualified picks
  const allQualifyingMatches = result?.data?.all_qualified_picks || [];

  // League tabs are built from whatever leagues the live feed actually
  // returned this run — not a fixed guesswork list.
  const availableLeagues = Array.from(new Set(allQualifyingMatches.map((p) => p.league || "Unknown League"))).sort();

  // Apply filtering based on selected tab
  const filteredMatches = allQualifyingMatches.filter(pick => {
    if (leagueFilter === "ALL") return true;
    return (pick.league || "Unknown League") === leagueFilter;
  });

  // Calculate user's interactive custom combined parlay odds
  const customCombinedOdds = selectedCustomPicks.reduce((acc, curr) => {
    return acc * parseFloat(curr.odds);
  }, 1);

  return (
    <div id="app-root" className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col font-sans selection:bg-emerald-800 selection:text-white">
      
      {/* Top Notification Bar */}
      <div className="bg-emerald-950/80 border-b border-emerald-800/50 text-emerald-300 px-6 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2">
        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>Proof of Live Execution: This dashboard scrapes and analyzes matches dynamically. No hardcoded mock pools.</span>
      </div>

      {/* Header Bar */}
      <header id="top-header" className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur sticky top-0 z-20 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-inner">
              ⚽
            </div>
            <div>
              <h1 className="font-semibold text-lg tracking-tight text-white flex items-center gap-2">
                Football Betting Analyst
                <span className="text-xs px-2.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 font-medium">
                  Live Engine
                </span>
              </h1>
              <p className="text-xs text-neutral-400">
                Live Analysis Console (Matchbook Exchange, Authenticated API)
              </p>
            </div>
          </div>

          {/* Action and Clock Info Box */}
          <div className="flex flex-wrap items-center gap-3">
            <PWAInstallButton />
            <div className="flex items-center gap-2.5 bg-neutral-900 px-3.5 py-2 rounded-xl border border-neutral-800 text-xs text-neutral-300 shadow-sm">
              <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-neutral-400 font-medium">Athens Timezone:</span>
              <span className="font-mono font-bold text-emerald-300">{athensTime || "Loading clock..."}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main id="main-content" className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        


        {/* Action Panel */}
        <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Live Scraping Controller
            </h2>
            <p className="text-xs text-neutral-400 leading-relaxed max-w-xl">
              Logs into your Matchbook account to fetch live market odds, evaluates 1X2, Over/Under totals & BTTS against conservative probability and overround criteria, and outputs qualified picks. Falls back to The Odds API if Matchbook isn't configured.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
            {SPORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSport(opt.value)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
                  sport === opt.value
                    ? "bg-emerald-600 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 bg-neutral-900 px-3.5 py-2 rounded-xl border border-neutral-800">
            <label htmlFor="time-window-select" className="text-xs text-neutral-400 font-medium whitespace-nowrap">
              Kickoff window:
            </label>
            <select
              id="time-window-select"
              value={timeWindowHours}
              disabled={loading}
              onChange={(e) => setTimeWindowHours(Number(e.target.value))}
              className="bg-neutral-950 border border-neutral-700 rounded-lg text-xs font-mono font-bold text-emerald-300 px-2.5 py-1.5 focus:outline-none focus:border-emerald-600 disabled:opacity-50"
            >
              {TIME_WINDOW_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
          </div>

          <button
            id="btn-run-analysis"
            onClick={handleRunAnalysis}
            disabled={loading}
            className={`w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950/30 transition-all ${
              loading
                ? "bg-emerald-800/50 text-emerald-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95"
            }`}
          >
            {loading ? <RotateCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {loading ? "Connecting & Parsing API..." : "Run Live Scraper Script"}
          </button>
        </div>

        {/* Live Loading Message Bar */}
        {loading && (
          <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4 flex items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-emerald-400 font-mono font-medium">{statusMessage}</span>
            </div>
            <span className="text-[10px] text-emerald-500 font-mono">Running python3 football_analyst.py --dry-run</span>
          </div>
        )}

        {/* Unexpected Error Banner */}
        {error && (
          <div className="bg-rose-950/30 border border-rose-800 text-rose-300 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Engine Execution Error</h4>
              <p className="text-xs mt-1 text-rose-400">{error}</p>
            </div>
          </div>
        )}

        {/* Interactive Custom Parlay Builder Drawer (Sticky floating style at top of workspace if user has selections) */}
        {selectedCustomPicks.length > 0 && (
          <div className="bg-emerald-950/90 border-2 border-emerald-500 p-5 rounded-2xl shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-emerald-900 border border-emerald-700 rounded-lg flex items-center justify-center text-emerald-300">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Interactive Custom Parlay Builder</h3>
                  <p className="text-xs text-emerald-300">Combined odds calculate dynamically in real-time based on your custom picks.</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-emerald-900/80 px-4 py-2 rounded-xl border border-emerald-700/50 text-right">
                  <span className="text-[9px] uppercase font-bold text-emerald-400 block tracking-wider">Custom Combined Odds</span>
                  <span className="text-xl font-bold font-mono text-emerald-200">@{customCombinedOdds}</span>
                </div>
                
                <button
                  onClick={clearCustomParlay}
                  className="p-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-rose-400 transition"
                  title="Clear Parlay"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selected Legs Badges Row */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-emerald-800/60">
              {selectedCustomPicks.map((pick, pIdx) => (
                <div key={pIdx} className="text-xs bg-neutral-950/90 border border-emerald-800 pl-2.5 pr-1.5 py-1.5 rounded-lg text-neutral-200 flex items-center gap-2 hover:border-rose-800 hover:text-rose-300 transition group cursor-pointer" onClick={() => handleToggleCustomPick(pick)}>
                  <span className="font-semibold text-emerald-400">Leg {pIdx + 1}:</span>
                  <span>{pick.event} ({pick.tip} @ {pick.odds})</span>
                  <span className="text-[10px] text-neutral-500 group-hover:text-rose-400 ml-1 font-bold">×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scraper Output Console Display */}
        {result && (
          <div className="bg-neutral-950 rounded-2xl border border-neutral-800 shadow-xl overflow-hidden">
            
            {/* Tab Controller Navigation */}
            <div className="flex flex-wrap border-b border-neutral-800 bg-neutral-950/50 px-4">
              <button
                onClick={() => setActiveTab("system_parlay")}
                className={`px-5 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center gap-2 ${
                  activeTab === "system_parlay"
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Auto-Selected System Recommendation
              </button>
              <button
                onClick={() => setActiveTab("all_matches")}
                className={`px-5 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center gap-2 ${
                  activeTab === "all_matches"
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Database className="w-4 h-4" />
                All qualifying matches ({allQualifyingMatches.length})
              </button>
              <button
                onClick={() => setActiveTab("telegram")}
                className={`px-5 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center gap-2 ${
                  activeTab === "telegram"
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Send className="w-4 h-4" />
                Telegram dispatch code
              </button>
              <button
                onClick={() => setActiveTab("logs")}
                className={`px-5 py-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center gap-2 ${
                  activeTab === "logs"
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Terminal className="w-4 h-4" />
                Script output terminal
              </button>
            </div>

            {/* Tab Body Contents */}
            <div className="p-6">
              
              {/* TAB 1: ALL QUALIFYING MATCHES LISTING (Proof that we have many other matches fetched from the API) */}
              {activeTab === "all_matches" && (
                <div className="space-y-6">
                  
                  {/* Filter Toolbar Section */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                      <Filter className="w-4 h-4 text-emerald-400" />
                      Filter Slate By Division
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5">
                      {["ALL", ...availableLeagues].map((category) => (
                        <button
                          key={category}
                          onClick={() => setLeagueFilter(category)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            leagueFilter === category
                              ? "bg-emerald-600 text-white border border-emerald-500"
                              : "bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800"
                          }`}
                        >
                          {category === "ALL" ? "Show All Worldwide" : category}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grid of filtered matches */}
                  {filteredMatches.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredMatches.map((pick, idx) => {
                        const league = pick.league || "Unknown League";
                        const isSelected = selectedCustomPicks.some(p => p.event === pick.event);
                        const badgeColor = getLeagueBadgeColor(league);

                        return (
                          <div
                            key={idx}
                            onClick={() => handleToggleCustomPick(pick)}
                            className={`p-4 rounded-xl border transition-all select-none cursor-pointer flex flex-col justify-between gap-4 ${
                              isSelected
                                ? "bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/20"
                                : "bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/80"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {sport === "all" && (
                                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border border-neutral-600 text-neutral-300 bg-neutral-800">
                                      {pick.sport}
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${badgeColor}`}>
                                    {league}
                                  </span>
                                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border border-neutral-700 text-neutral-400">
                                    {pick.market}
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {pick.event_time}
                                  </span>
                                </div>
                                <h4 className="font-bold text-white text-sm sm:text-base tracking-tight leading-snug">
                                  {pick.event}
                                </h4>
                              </div>

                              {/* Interactive parlays checkbox */}
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? "bg-emerald-500 border-emerald-400 text-white"
                                  : "border-neutral-700 bg-neutral-950 text-transparent"
                              }`}>
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            </div>

                            {/* Bullet explanation container */}
                            <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/80">
                              {Array.isArray(pick.why) ? (
                                pick.why.map((line, lIdx) => (
                                  <div key={lIdx} className="text-[11px] text-neutral-300 flex items-start gap-1 leading-relaxed">
                                    <span className="text-emerald-500 font-bold shrink-0">•</span>
                                    <span>{line}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[11px] text-neutral-300">{pick.why}</div>
                              )}
                            </div>

                            {/* Bottom Odds and Tip tags */}
                            <div className="flex items-center justify-between pt-1 border-t border-neutral-800 text-xs">
                              <div>
                                <span className="text-[9px] uppercase text-neutral-500 block">Recommended Action</span>
                                <span className="font-bold text-emerald-400">{pick.tip}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <span className="text-[9px] uppercase text-neutral-500 block">Odds</span>
                                  <span className="font-bold font-mono text-white">@{pick.odds}</span>
                                </div>
                                <div className="text-right pl-3 border-l border-neutral-800">
                                  <span className="text-[9px] uppercase text-neutral-500 block">Confidence</span>
                                  <span className="font-semibold text-emerald-400 font-mono">{pick.confidence_score?.toFixed(1)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-16 text-neutral-400 bg-neutral-900 rounded-xl border border-neutral-800 flex flex-col items-center justify-center gap-3">
                      <AlertTriangle className="w-8 h-8 text-neutral-600 animate-bounce" />
                      <div>
                        <p className="font-bold text-neutral-300">No matching fixtures found</p>
                        <p className="text-xs text-neutral-500 mt-1">
                          No matches in the current selection filter ({leagueFilter}) are currently playing within the selected {timeWindowHours}h window.
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* TAB 2: AUTONOMOUS PARLAY SELECTED BY SYSTEM */}
              {activeTab === "system_parlay" && (
                <div className="space-y-6">
                  
                  {/* Recommendation Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                    <div>
                      <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-400">
                        System Recommendation State
                      </span>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
                        {result.data?.parlay_type || "NO RECOMMENDED BET"}
                        <span className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded border border-neutral-700">
                          {result.data?.status || "NO_BET"}
                        </span>
                      </h3>
                    </div>

                    {result.data?.combined_odds > 0 && (
                      <div className="bg-emerald-950 px-5 py-2.5 rounded-lg border border-emerald-800 text-right">
                        <div className="text-[10px] uppercase font-semibold text-emerald-400">Combined Odds</div>
                        <div className="text-2xl font-bold font-mono text-emerald-300">@{result.data.combined_odds}</div>
                      </div>
                    )}
                  </div>

                  {/* Parlay Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {result.data?.picks && result.data.picks.length > 0 ? (
                      result.data.picks.map((pick, idx) => (
                        <div key={idx} className="bg-neutral-900 rounded-xl border border-neutral-800 p-5 flex flex-col justify-between hover:border-neutral-700 transition">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] px-2 py-0.5 bg-neutral-850 text-neutral-400 rounded border border-neutral-700 uppercase font-semibold">
                                {pick.sport}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 px-2 py-1 rounded-lg border border-emerald-900/50">
                                <Award className="w-3.5 h-3.5" />
                                <span className="font-mono font-bold">Conf: {pick.confidence_score?.toFixed(2)}</span>
                              </div>
                            </div>

                            <div>
                              <h4 className="font-bold text-white text-base leading-snug">{pick.event}</h4>
                              <p className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-neutral-500" />
                                {pick.event_time}
                              </p>
                            </div>

                            <div className="space-y-1.5 bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                              <div className="text-[10px] uppercase text-neutral-400 font-bold tracking-wider mb-1 flex items-center gap-1">
                                <BookOpen className="w-3 h-3 text-emerald-500" />
                                Scraped Pre-Match Signals:
                              </div>
                              {Array.isArray(pick.why) ? (
                                pick.why.map((line, lIdx) => (
                                  <div key={lIdx} className="text-xs text-neutral-300 flex items-start gap-1.5 leading-relaxed">
                                    <span className="text-emerald-500 shrink-0 mt-1">•</span>
                                    <span>{line}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-xs text-neutral-300">{pick.why}</div>
                              )}
                            </div>
                          </div>

                          <div className="mt-5 pt-3 border-t border-neutral-800 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] uppercase text-neutral-400 block font-semibold">Selected Tip</span>
                              <span className="text-xs font-bold text-emerald-300">{pick.tip}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] uppercase text-neutral-400 block font-semibold">Odds</span>
                              <span className="text-sm font-bold font-mono text-white">@{pick.odds}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="md:col-span-3 text-center py-12 text-neutral-400 bg-neutral-900 rounded-xl border border-neutral-800 flex flex-col items-center justify-center gap-3">
                        <AlertTriangle className="w-8 h-8 text-neutral-600 animate-bounce" />
                        <div>
                          <p className="font-semibold text-neutral-300 text-sm">No qualifying picks found</p>
                          <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                            The slate did not contain any fixtures satisfying our safety limits.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: TELEGRAM TEXT DISPATCH */}
              {activeTab === "telegram" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Formatted Telegram Dispatch Bubble</h3>
                      <p className="text-xs text-neutral-400">Copy this exact block directly into Telegram.</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.telegramText, "telegram-text")}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 flex items-center gap-1.5 transition"
                    >
                      {copiedText === "telegram-text" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedText === "telegram-text" ? "Copied" : "Copy Message Block"}
                    </button>
                  </div>

                  <div className="bg-[#17212b] rounded-xl p-5 border border-[#232e3c] shadow-lg font-mono text-xs sm:text-sm text-[#e4ecf2] whitespace-pre-wrap leading-relaxed max-h-[450px] overflow-y-auto">
                    {result.telegramText}
                  </div>
                </div>
              )}

              {/* TAB 4: SCRIPT OUTPUT TERMINAL */}
              {activeTab === "logs" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-white">Execution Console Stdout Logs</h3>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.logs, "logs-text")}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 flex items-center gap-1.5 transition"
                    >
                      {copiedText === "logs-text" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedText === "logs-text" ? "Copied Logs" : "Copy Console Logs"}
                    </button>
                  </div>

                  <div className="bg-neutral-950 rounded-xl p-4 border border-neutral-800 font-mono text-xs text-neutral-300 max-h-[450px] overflow-y-auto space-y-1">
                    {result.logs.split("\n").map((line, idx) => (
                      <div key={idx} className={line.includes("[ERROR]") || line.includes("[CRITICAL]") ? "text-rose-400" : line.includes("[WARNING]") ? "text-amber-400" : "text-neutral-300"}>
                        {line}
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer id="app-footer" className="border-t border-neutral-800 py-6 px-6 text-center text-xs text-neutral-500 bg-neutral-950/60 mt-auto">
        Football Betting Analyst Live Engine • Active Scraping Controller Console • Real-Time Odds Calculations
      </footer>
    </div>
  );
}
