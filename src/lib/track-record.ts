// Track-record engine: compares past predictions against their actual outcomes.
//
// For each date in the requested range:
//  - If a real AnalysisRun exists in the DB (e.g. today's LLM picks) → use those.
//  - Otherwise → generate deterministic simulated picks from technicals computed
//    on the candle slice up to that date (back-filled history).
//
// Outcome resolution: for each pick, the pick-day candle tells us whether price
// entered the entry zone, and whether target or SL was hit first. Intraday picks
// resolve on the same day's candle. Realised P&L is expressed in R-multiples.
//
// The candle series now comes from the shared market-data layer, so a backtest
// runs against live history when a provider is reachable and falls back to the
// deterministic synthetic series otherwise.

import { db } from "./db";
import { STOCK_UNIVERSE, getStock } from "./stocks";
import { getUniverseSeries } from "./market-data";
import { summarize, MIN_CANDLES } from "./indicators";
import type {
  Candle,
  StockMeta,
  TechSummary,
  TrackRecordResponse,
  TrackRecordRow,
  TrackRecordSummary,
} from "./types";

export type { TrackRecordResponse, TrackRecordRow, TrackRecordSummary };

export type TrackRange = "1d" | "db" | "7d" | "1m" | "custom";

/** Picks simulated per historical session. */
const PICKS_PER_DAY = 6;
/** ~6 months of history: enough for a 1-month lookback plus indicator warm-up. */
const SERIES_LEN = 140;

// ---------- Series access ----------

/** One universe-wide load per track-record build, reused across every date in
 *  the range. The previous implementation cached in a module-level Map that was
 *  never invalidated, so a long-running server served stale prices forever. */
async function loadSeries(): Promise<Map<string, Candle[]>> {
  const raw = await getUniverseSeries(SERIES_LEN);
  const out = new Map<string, Candle[]>();
  for (const [symbol, result] of raw) out.set(symbol, result.candles);
  return out;
}

/** The union of session dates across the universe, ascending. Live providers
 *  can return slightly different date sets per symbol (halts, listings), so a
 *  union is safer than trusting one symbol's calendar. */
function collectDates(series: Map<string, Candle[]>): string[] {
  const set = new Set<string>();
  for (const candles of series.values()) {
    for (const c of candles) set.add(c.date);
  }
  return [...set].sort();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- Simulated pick generation (for dates without stored LLM runs) ----------

interface SimPick {
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
}

export function buildSimPick(meta: StockMeta, summary: TechSummary): SimPick {
  const ltp = summary.lastClose;
  const entryLow = round2(ltp * 0.998);
  const entryHigh = round2(ltp * 1.002);
  const entryMid = (entryLow + entryHigh) / 2;

  // ATR-based intraday stop: 0.7x ATR below entry with 1.5 R:R — calibrated so
  // both stop and target land within a typical day's range, producing a
  // realistic win / loss / time-exit mix rather than everything timing out.
  const atrAbs = summary.atr14 || entryMid * 0.015;
  let stop = entryMid - 0.7 * atrAbs;
  const minStopDist = entryMid * 0.004;
  if (entryMid - stop < minStopDist) stop = entryMid - minStopDist;
  stop = round2(stop);

  const stopDist = Math.max(0.01, entryMid - stop);
  const target = round2(entryMid + 1.5 * stopDist);
  const rr = (target - entryMid) / stopDist;

  const confidence = Math.max(50, Math.min(80, summary.bullishScore));
  const conviction = confidence >= 70 ? "high" : confidence >= 60 ? "medium" : "low";

  return {
    symbol: meta.symbol,
    name: meta.name,
    sector: meta.sector,
    entryLow,
    entryHigh,
    stopLoss: stop,
    target,
    ltp,
    confidence,
    conviction,
    riskReward: Math.round(rr * 100) / 100,
  };
}

function simulatePicksForDate(date: string, series: Map<string, Candle[]>): SimPick[] {
  const candidates: { meta: StockMeta; summary: TechSummary }[] = [];

  for (const meta of STOCK_UNIVERSE) {
    const candles = series.get(meta.symbol);
    if (!candles) continue;
    const idx = candles.findIndex((c) => c.date === date);
    // Only data available *before* the session may inform the pick — using the
    // pick-day candle itself would be lookahead bias.
    if (idx < MIN_CANDLES) continue;

    const priorCandles = candles.slice(0, idx);
    let summary: TechSummary;
    try {
      summary = summarize(priorCandles);
    } catch {
      continue;
    }
    candidates.push({ meta, summary });
  }

  return candidates
    .sort((a, b) => b.summary.bullishScore - a.summary.bullishScore)
    .slice(0, PICKS_PER_DAY)
    .map((c) => buildSimPick(c.meta, c.summary));
}

// ---------- Outcome computation ----------

export function computeOutcome(
  pick: { entryLow: number; entryHigh: number; stopLoss: number; target: number },
  candle: Candle,
): {
  outcome: TrackRecordRow["outcome"];
  outcomeLabel: string;
  realizedR: number;
  exitPrice: number | null;
  exitNote: string;
} {
  const { entryLow, entryHigh, stopLoss, target } = pick;

  // Did price trade into the entry zone?
  const entered = candle.low <= entryHigh && candle.high >= entryLow;
  if (!entered) {
    return {
      outcome: "not-triggered",
      outcomeLabel: "Not Triggered",
      realizedR: 0,
      exitPrice: null,
      exitNote: "Price did not reach entry zone",
    };
  }

  // Estimate the fill: at the open if it opened inside the band, otherwise at
  // the edge the price crossed first.
  const entryPrice =
    candle.open >= entryLow && candle.open <= entryHigh
      ? candle.open
      : candle.open < entryLow
        ? entryLow
        : entryHigh;

  const risk = Math.max(0.01, entryPrice - stopLoss);
  const hitSL = candle.low <= stopLoss;
  const hitTarget = candle.high >= target;

  if (hitSL && hitTarget) {
    // Both levels hit on the same candle — daily bars cannot tell us the order,
    // so the candle's direction is used as a proxy.
    if (candle.close >= candle.open) {
      return {
        outcome: "target",
        outcomeLabel: "Target Hit",
        realizedR: Math.round(((target - entryPrice) / risk) * 100) / 100,
        exitPrice: target,
        exitNote: "Both levels hit intraday; bullish close → target assumed first",
      };
    }
    return {
      outcome: "sl",
      outcomeLabel: "SL Hit",
      realizedR: -1,
      exitPrice: stopLoss,
      exitNote: "Both levels hit intraday; bearish close → SL assumed first",
    };
  }
  if (hitSL) {
    return {
      outcome: "sl",
      outcomeLabel: "SL Hit",
      realizedR: -1,
      exitPrice: stopLoss,
      exitNote: "Stop loss hit intraday",
    };
  }
  if (hitTarget) {
    return {
      outcome: "target",
      outcomeLabel: "Target Hit",
      realizedR: Math.round(((target - entryPrice) / risk) * 100) / 100,
      exitPrice: target,
      exitNote: "Target achieved intraday",
    };
  }

  // Neither hit — exit at the close.
  return {
    outcome: "time-exit",
    outcomeLabel: "Time Exit",
    realizedR: Math.round(((candle.close - entryPrice) / risk) * 100) / 100,
    exitPrice: round2(candle.close),
    exitNote: "Exited at close",
  };
}

function rowFromPick(
  pick: SimPick | any,
  date: string,
  source: "live-llm" | "simulated",
  isLive: boolean,
  series: Map<string, Candle[]>,
): TrackRecordRow | null {
  const meta = getStock(pick.symbol);
  if (!meta) return null;

  const base = {
    date,
    symbol: pick.symbol,
    name: pick.name || meta.name,
    sector: pick.sector || meta.sector,
    entryLow: pick.entryLow,
    entryHigh: pick.entryHigh,
    stopLoss: pick.stopLoss,
    target: pick.target,
    ltp: pick.ltp,
    confidence: pick.confidence,
    conviction: pick.conviction,
    riskReward: pick.riskReward,
    source,
  };

  // Today's picks have not resolved yet.
  if (isLive) {
    return {
      ...base,
      outcome: "live",
      outcomeLabel: "Live",
      realizedR: 0,
      exitPrice: null,
      exitNote: "Awaiting market resolution",
    };
  }

  const candles = series.get(pick.symbol) ?? [];
  const idx = candles.findIndex((c) => c.date === date);
  if (idx < 0) {
    return {
      ...base,
      outcome: "live",
      outcomeLabel: "Live",
      realizedR: 0,
      exitPrice: null,
      exitNote: "No candle data for this date",
    };
  }

  return { ...base, ...computeOutcome(pick, candles[idx]) };
}

// ---------- Main: build track record for a date range ----------

export async function getTrackRecord(
  range: TrackRange,
  from?: string,
  to?: string,
): Promise<TrackRecordResponse> {
  const series = await loadSeries();
  const allDates = collectDates(series);
  if (allDates.length < 3) return emptyResponse();

  const today = allDates[allDates.length - 1];
  const yesterday = allDates[allDates.length - 2];

  const { fromDate, toDate } = resolveRange(range, allDates, from, to);

  // Candle dates within [fromDate, toDate]; today is appended for live rows.
  const rangeDates = allDates.filter((d) => d >= fromDate && d <= toDate);
  const allQueryDates = rangeDates.includes(today) ? rangeDates : [...rangeDates, today];

  const storedRuns = await db.analysisRun.findMany({
    where: { runDate: { in: allQueryDates } },
  });
  const storedByDate = new Map(storedRuns.map((r) => [r.runDate, r]));

  const rows: TrackRecordRow[] = [];

  for (const date of allQueryDates) {
    const isLive = date === today;
    const stored = storedByDate.get(date);
    let picks: any[] = [];
    let source: "live-llm" | "simulated" = "simulated";

    if (stored?.picksJson) {
      try {
        const parsed = JSON.parse(stored.picksJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          picks = parsed;
          source = "live-llm";
        }
      } catch {
        picks = [];
      }
    }

    if (picks.length === 0) {
      picks = simulatePicksForDate(date, series);
      source = "simulated";
    }

    for (const pick of picks) {
      const row = rowFromPick(pick, date, source, isLive, series);
      if (row) rows.push(row);
    }
  }

  // Sort: date desc, then confidence desc
  rows.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.confidence - a.confidence;
  });

  return {
    rows,
    summary: computeSummary(rows, fromDate, toDate),
    availableRange: { earliest: allDates[0], latest: today },
  };
}

/** Map a range keyword onto concrete session dates, clamped to what history we
 *  actually hold so a short series cannot produce an undefined bound. */
export function resolveRange(
  range: TrackRange,
  allDates: string[],
  from?: string,
  to?: string,
): { fromDate: string; toDate: string } {
  const n = allDates.length;
  const at = (offsetFromEnd: number) => allDates[Math.max(0, n - offsetFromEnd)];
  const yesterday = at(2);

  switch (range) {
    case "1d":
      return { fromDate: yesterday, toDate: yesterday };
    case "db": {
      // "Day before" — the session prior to yesterday.
      const dayBefore = at(3);
      return { fromDate: dayBefore, toDate: dayBefore };
    }
    case "7d":
      return { fromDate: at(8), toDate: yesterday };
    case "1m":
      return { fromDate: at(31), toDate: yesterday };
    case "custom":
    default: {
      const toDate = to && to <= yesterday ? to : yesterday;
      const candidate = from && from >= allDates[0] && from <= toDate ? from : at(8);
      // The 7-session fallback can itself sit past a near-term `to`, which would
      // yield from > to and an empty range. Clamp so the window is never inverted.
      const fromDate = candidate <= toDate ? candidate : allDates[0];
      return { fromDate, toDate };
    }
  }
}

export function computeSummary(
  rows: TrackRecordRow[],
  from: string,
  to: string,
): TrackRecordSummary {
  const live = rows.filter((r) => r.outcome === "live");
  const trades = rows.filter(
    (r) => r.outcome === "target" || r.outcome === "sl" || r.outcome === "time-exit",
  );
  const targetHits = rows.filter((r) => r.outcome === "target").length;
  const slHits = rows.filter((r) => r.outcome === "sl").length;
  const timeExits = rows.filter((r) => r.outcome === "time-exit").length;
  const notTriggered = rows.filter((r) => r.outcome === "not-triggered").length;

  const winRate = trades.length > 0 ? (targetHits / trades.length) * 100 : 0;
  const totalR = trades.reduce((a, b) => a + b.realizedR, 0);
  const avgR = trades.length > 0 ? totalR / trades.length : 0;

  const sorted = [...trades].sort((a, b) => b.realizedR - a.realizedR);

  // Peak-to-trough drawdown of the cumulative R curve, walked oldest-first.
  const chronological = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of chronological) {
    cumulative += t.realizedR;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  const grossWin = trades.filter((t) => t.realizedR > 0).reduce((a, b) => a + b.realizedR, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.realizedR < 0).reduce((a, b) => a + b.realizedR, 0),
  );

  return {
    from,
    to,
    totalPicks: rows.length,
    livePicks: live.length,
    tradesTaken: trades.length,
    targetHits,
    slHits,
    timeExits,
    notTriggered,
    winRate: Math.round(winRate * 10) / 10,
    avgRealizedR: Math.round(avgR * 100) / 100,
    totalR: Math.round(totalR * 100) / 100,
    bestPick: sorted[0],
    worstPick: sorted[sorted.length - 1],
    liveCount: rows.filter((r) => r.source === "live-llm").length,
    simulatedCount: rows.filter((r) => r.source === "simulated").length,
    // Expectancy per trade in R — the single most useful number here.
    expectancyR: Math.round(avgR * 100) / 100,
    maxDrawdownR: Math.round(maxDrawdown * 100) / 100,
    profitFactor: grossLoss === 0 ? 0 : Math.round((grossWin / grossLoss) * 100) / 100,
  };
}

/** Serialise track-record rows to CSV for download. */
export function trackRecordToCsv(rows: TrackRecordRow[]): string {
  const headers = [
    "Date",
    "Symbol",
    "Name",
    "Sector",
    "Entry Low",
    "Entry High",
    "Stop Loss",
    "Target",
    "R:R",
    "Confidence",
    "Conviction",
    "Source",
    "Outcome",
    "Exit Price",
    "Realized R",
    "Note",
  ];
  const lines = rows.map((r) =>
    [
      r.date,
      r.symbol,
      r.name,
      r.sector,
      r.entryLow,
      r.entryHigh,
      r.stopLoss,
      r.target,
      r.riskReward,
      r.confidence,
      r.conviction,
      r.source,
      r.outcomeLabel,
      r.exitPrice ?? "",
      r.realizedR,
      r.exitNote,
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function emptyResponse(): TrackRecordResponse {
  return {
    rows: [],
    summary: {
      from: "",
      to: "",
      totalPicks: 0,
      livePicks: 0,
      tradesTaken: 0,
      targetHits: 0,
      slHits: 0,
      timeExits: 0,
      notTriggered: 0,
      winRate: 0,
      avgRealizedR: 0,
      totalR: 0,
      liveCount: 0,
      simulatedCount: 0,
      expectancyR: 0,
      maxDrawdownR: 0,
      profitFactor: 0,
    },
    availableRange: { earliest: "", latest: "" },
  };
}
