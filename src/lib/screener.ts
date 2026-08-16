// Screener engine: computes the full technical picture for every symbol in the
// universe and derives market-breadth statistics from it.
//
// The dashboard only ever surfaced the six picks, so the work already being
// done across the whole universe was thrown away. This exposes it: the same
// indicator pass now backs a sortable screener, a sector heatmap and the
// advance/decline breadth line.

import { STOCK_UNIVERSE } from "./stocks";
import { summarize, MIN_CANDLES } from "./indicators";
import { getUniverseSeries, aggregateSource } from "./market-data";
import type { ScreenerResponse, ScreenerRow, SectorBreadth, TechSummary } from "./types";

export async function runScreener(): Promise<ScreenerResponse> {
  const series = await getUniverseSeries(120);
  const rows: ScreenerRow[] = [];
  const summaries: TechSummary[] = [];

  for (const meta of STOCK_UNIVERSE) {
    const s = series.get(meta.symbol);
    if (!s || s.candles.length < MIN_CANDLES) continue;
    let summary: TechSummary;
    try {
      summary = summarize(s.candles);
    } catch {
      // A symbol with too little history is skipped rather than failing the
      // whole screen.
      continue;
    }
    summaries.push(summary);
    rows.push({
      symbol: meta.symbol,
      name: meta.name,
      sector: meta.sector,
      ltp: round2(summary.lastClose),
      change1d: round2(summary.change1d),
      change5d: round2(summary.change5d),
      change20d: round2(summary.change20d),
      rsi14: round1(summary.rsi14),
      adx14: round1(summary.adx14),
      atrPct: round2(summary.atrPct),
      volumeRatio: round2(summary.volumeRatio),
      emaTrend: summary.emaTrend,
      macdHist: round2(summary.macdHist),
      supertrendDir: summary.supertrendDir,
      bbPercentB: round2(summary.bbPercentB),
      stochK: round1(summary.stochK),
      distanceFromHigh: round2(summary.distanceFromHigh),
      bullishScore: summary.bullishScore,
      setupLabel: summary.setupLabel,
      swingHigh: round2(summary.swingHigh),
      swingLow: round2(summary.swingLow),
    });
  }

  rows.sort((a, b) => b.bullishScore - a.bullishScore);

  return {
    rows,
    breadth: computeBreadth(rows, summaries),
    sectors: computeSectorBreadth(rows),
    source: aggregateSource(series.values()),
    asOf: new Date().toISOString(),
  };
}

export function computeBreadth(
  rows: ScreenerRow[],
  summaries: TechSummary[],
): ScreenerResponse["breadth"] {
  const total = rows.length;
  if (total === 0) {
    return {
      total: 0,
      advancing: 0,
      declining: 0,
      aboveEma20: 0,
      aboveEma50: 0,
      avgScore: 0,
      avgRsi: 0,
      strongTrend: 0,
    };
  }
  return {
    total,
    advancing: rows.filter((r) => r.change1d > 0).length,
    declining: rows.filter((r) => r.change1d < 0).length,
    aboveEma20: summaries.filter((s) => s.lastClose > s.ema20).length,
    aboveEma50: summaries.filter((s) => s.lastClose > s.ema50).length,
    avgScore: round1(mean(rows.map((r) => r.bullishScore))),
    avgRsi: round1(mean(rows.map((r) => r.rsi14))),
    strongTrend: rows.filter((r) => r.adx14 >= 25).length,
  };
}

export function computeSectorBreadth(rows: ScreenerRow[]): SectorBreadth[] {
  const bySector = new Map<string, ScreenerRow[]>();
  for (const r of rows) {
    const list = bySector.get(r.sector) ?? [];
    list.push(r);
    bySector.set(r.sector, list);
  }

  return [...bySector.entries()]
    .map(([sector, list]) => ({
      sector,
      count: list.length,
      advancing: list.filter((r) => r.change1d > 0).length,
      declining: list.filter((r) => r.change1d < 0).length,
      avgScore: round1(mean(list.map((r) => r.bullishScore))),
      avgChange1d: round2(mean(list.map((r) => r.change1d))),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

/** Serialise screener rows to CSV for download. */
export function screenerToCsv(rows: ScreenerRow[]): string {
  const headers = [
    "Symbol",
    "Name",
    "Sector",
    "LTP",
    "1D %",
    "5D %",
    "20D %",
    "RSI14",
    "ADX14",
    "ATR %",
    "Vol Ratio",
    "EMA Trend",
    "MACD Hist",
    "Supertrend",
    "%B",
    "Stoch %K",
    "From 20D High %",
    "Score",
    "Setup",
  ];
  const lines = rows.map((r) =>
    [
      r.symbol,
      r.name,
      r.sector,
      r.ltp,
      r.change1d,
      r.change5d,
      r.change20d,
      r.rsi14,
      r.adx14,
      r.atrPct,
      r.volumeRatio,
      r.emaTrend,
      r.macdHist,
      r.supertrendDir,
      r.bbPercentB,
      r.stochK,
      r.distanceFromHigh,
      r.bullishScore,
      r.setupLabel,
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

/** Quote a CSV cell, escaping embedded quotes. Setup labels contain commas. */
export function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
