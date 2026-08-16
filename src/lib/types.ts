// Single source of truth for domain types shared between server code
// (lib/*, API routes) and client components.
//
// This module must stay free of runtime imports — it is pulled into client
// bundles via `import type`, and anything with side effects (the AI SDK, the
// Prisma client) would otherwise leak into the browser build.

// ---------- Market data ----------

export interface Candle {
  date: string; // ISO date, YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Where a candle series came from. Surfaced in the UI so simulated prices are
 *  never mistaken for real quotes. */
export type DataSource = "live" | "synthetic";

export interface SeriesResult {
  candles: Candle[];
  source: DataSource;
  /** Provider identifier, e.g. "yahoo" or "seeded-prng". */
  provider: string;
  /** Populated when a live fetch was attempted and failed. */
  note?: string;
}

export interface StockMeta {
  symbol: string;
  name: string;
  sector: string;
  baseline: number; // approximate recent price (INR)
  lotSize: number;
  volatility: number; // daily volatility estimate (fraction, e.g. 0.018 = 1.8%)
}

// ---------- Technicals ----------

export interface PivotLevels {
  pp: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
}

/** One weighted input to the composite bullish score, kept so the score can be
 *  explained in the UI instead of appearing as an unsourced number. */
export interface SignalContribution {
  key: string;
  label: string;
  points: number; // signed contribution to the score
  detail: string;
}

export interface TechSummary {
  lastClose: number;
  change1d: number; // %
  change5d: number; // %
  change20d: number; // %
  rsi14: number;
  ema20: number;
  ema50: number;
  emaTrend: "up" | "down" | "flat";
  macdHist: number;
  macdBullish: boolean;
  atr14: number;
  atrPct: number; // ATR as % of price
  vol20Avg: number;
  lastVolume: number;
  volumeRatio: number; // last volume / 20d avg
  swingHigh: number; // recent resistance
  swingLow: number; // recent support
  distanceFromHigh: number; // %
  distanceFromLow: number; // %
  bullishScore: number; // 0-100 composite
  setupLabel: string; // human-readable pattern

  // Extended indicator set
  bbUpper: number;
  bbMid: number;
  bbLower: number;
  bbWidthPct: number; // band width as % of mid — squeeze detector
  bbPercentB: number; // 0 = lower band, 1 = upper band
  adx14: number;
  plusDI: number;
  minusDI: number;
  stochK: number;
  stochD: number;
  supertrend: number;
  supertrendDir: "up" | "down";
  obvSlope: number; // % change in OBV over the last 10 sessions
  vwap20: number; // rolling 20-session volume-weighted average price
  pivots: PivotLevels;
  periodHigh: number; // highest high in the loaded series
  periodLow: number; // lowest low in the loaded series
  signals: SignalContribution[];
}

// ---------- Pre-market intelligence ----------

export interface NewsItem {
  title: string;
  snippet: string;
  url: string;
  source: string;
  date?: string;
}

export interface GlobalCue {
  name: string;
  change: string; // e.g. "+0.8%"
  note: string;
}

export interface EconomicEvent {
  time: string;
  event: string;
  impact: "high" | "medium" | "low";
  forecast?: string;
}

export interface SectorTilt {
  sector: string;
  bias: "bullish" | "bearish" | "neutral";
  reason: string;
}

export interface PremarketIntel {
  asOf: string;
  globalCues: GlobalCue[];
  economicEvents: EconomicEvent[];
  fiidii: string; // narrative
  newsDigest: NewsItem[];
  keyThemes: string[];
  sectorTilts: SectorTilt[];
  sentiment: "Risk-On" | "Cautious" | "Risk-Off" | "Mixed";
  sentimentScore: number; // -100..100
  summary: string; // 2-3 sentence narrative
}

// ---------- Picks ----------

export interface PickIndicators {
  rsi14: number;
  ema20: number;
  ema50: number;
  macdHist: number;
  atrPct: number;
  volumeRatio: number;
  swingHigh: number;
  swingLow: number;
  setupLabel: string;
  adx14: number;
  bbPercentB: number;
  supertrendDir: "up" | "down";
  stochK: number;
}

export interface StockPick {
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  direction: "long";
  ltp: number;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target: number;
  target2?: number; // stretch target
  riskReward: number;
  confidence: number; // 0-100
  conviction: "high" | "medium" | "low";
  indicators: PickIndicators;
  technicalThesis: string;
  fundamentalCatalyst: string;
  newsTrigger: string;
  risks: string[];
  invalidation: string;
  timeHorizon: string;
  positionGuidance: string;
  /** "llm" when the strategist selected it, "screen" when backfilled from the
   *  technical screen. Shown on the card so the two are never conflated. */
  origin: "llm" | "screen";
  dataSource: DataSource;
  signals: SignalContribution[];
}

export interface PicksPayload {
  picks: StockPick[];
  intel: PremarketIntel;
  dataSource: DataSource;
}

// ---------- Stock detail ----------

export interface StockDetail {
  meta: StockMeta;
  candles: Candle[];
  summary: TechSummary;
  source: DataSource;
  provider: string;
}

// ---------- Screener ----------

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  ltp: number;
  change1d: number;
  change5d: number;
  change20d: number;
  rsi14: number;
  adx14: number;
  atrPct: number;
  volumeRatio: number;
  emaTrend: "up" | "down" | "flat";
  macdHist: number;
  supertrendDir: "up" | "down";
  bbPercentB: number;
  stochK: number;
  distanceFromHigh: number;
  bullishScore: number;
  setupLabel: string;
  swingHigh: number;
  swingLow: number;
}

export interface SectorBreadth {
  sector: string;
  count: number;
  advancing: number;
  declining: number;
  avgScore: number;
  avgChange1d: number;
}

export interface ScreenerResponse {
  rows: ScreenerRow[];
  breadth: {
    total: number;
    advancing: number;
    declining: number;
    aboveEma20: number;
    aboveEma50: number;
    avgScore: number;
    avgRsi: number;
    strongTrend: number; // ADX >= 25
  };
  sectors: SectorBreadth[];
  source: DataSource;
  asOf: string;
}

// ---------- Journal (paper trading) ----------

export type TradeStatus = "open" | "closed";
export type TradeOutcome = "target" | "sl" | "manual" | "open";

export interface JournalTrade {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  direction: "long";
  entryPrice: number;
  stopLoss: number;
  target: number;
  quantity: number;
  status: TradeStatus;
  outcome: TradeOutcome;
  exitPrice: number | null;
  notes: string;
  openedAt: string; // ISO
  closedAt: string | null;
  /** Mark-to-market fields, computed on read against the latest candle. */
  lastPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  pnl: number;
  rMultiple: number;
  riskAmount: number;
}

export interface JournalStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  avgR: number;
  totalR: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  /** Cumulative realized P&L after each closed trade, oldest first. */
  equityCurve: { date: string; cumulative: number }[];
}

export interface JournalResponse {
  trades: JournalTrade[];
  stats: JournalStats;
}

export interface WatchlistEntry {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  note: string;
  createdAt: string;
  ltp: number;
  change1d: number;
  rsi14: number;
  bullishScore: number;
  setupLabel: string;
}

// ---------- Market status ----------

export type MarketPhase =
  | "pre-open"
  | "open"
  | "post-close"
  | "closed"
  | "weekend"
  | "holiday";

export interface MarketStatus {
  phase: MarketPhase;
  label: string;
  isOpen: boolean;
  isPreOpen: boolean;
  nowIST: string;
  dateIST: string;
  openCountdown?: string; // HH:MM until pre-open if before open
  nextSessionLabel: string;
  accent: "emerald" | "amber" | "rose" | "slate";
  holidayName?: string;
}

// ---------- Track record ----------

export interface TrackRecordRow {
  date: string;
  symbol: string;
  name: string;
  sector: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target: number;
  ltp: number;
  confidence: number;
  conviction: string;
  riskReward: number;
  source: "live-llm" | "simulated";
  outcome: "target" | "sl" | "time-exit" | "not-triggered" | "live";
  outcomeLabel: string;
  realizedR: number;
  exitPrice: number | null;
  exitNote: string;
}

export interface TrackRecordSummary {
  from: string;
  to: string;
  totalPicks: number;
  livePicks: number;
  tradesTaken: number;
  targetHits: number;
  slHits: number;
  timeExits: number;
  notTriggered: number;
  winRate: number;
  avgRealizedR: number;
  totalR: number;
  bestPick?: TrackRecordRow;
  worstPick?: TrackRecordRow;
  liveCount: number;
  simulatedCount: number;
  expectancyR: number;
  maxDrawdownR: number;
  profitFactor: number;
}

export interface TrackRecordResponse {
  rows: TrackRecordRow[];
  summary: TrackRecordSummary;
  availableRange: { earliest: string; latest: string };
}
