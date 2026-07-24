// Market data access layer.
//
// The dashboard was originally built entirely on a seeded PRNG, which meant
// every price on screen was fabricated. This module puts a real provider in
// front of that generator:
//
//   1. Try the configured live provider (Yahoo Finance daily chart API).
//   2. On timeout, HTTP error, or malformed payload, fall back to the
//      deterministic synthetic series.
//
// Whichever path is taken, the result carries a `source` field that is threaded
// all the way to the UI, so a synthetic series is never displayed as if it were
// a real quote. A short-lived circuit breaker stops us re-attempting a provider
// that is unreachable (locked-down network, provider outage) on every request.

import type { Candle, DataSource, SeriesResult, StockMeta } from "./types";
import { generateCandles } from "./ohlc";
import { STOCK_UNIVERSE, getStock } from "./stocks";

const DEFAULT_DAYS = 120;

/** How long a fetched series stays warm before we re-fetch. Daily candles only
 *  change once per session, so this is generous. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** After this many consecutive live failures we stop calling the provider… */
const BREAKER_THRESHOLD = 3;
/** …for this long, then allow a single probe through. */
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000;

const FETCH_TIMEOUT_MS = Number(process.env.MARKET_DATA_TIMEOUT_MS || 4000);

export type ProviderMode = "auto" | "live" | "synthetic";

/** `auto` (default) tries live and silently falls back; `live` still falls back
 *  but surfaces the failure note; `synthetic` never hits the network. */
export function providerMode(): ProviderMode {
  const raw = (process.env.MARKET_DATA_PROVIDER || "auto").toLowerCase();
  return raw === "live" || raw === "synthetic" ? raw : "auto";
}

// ---------- Caches ----------

interface CacheEntry {
  result: SeriesResult;
  at: number;
}

const seriesCache = new Map<string, CacheEntry>();

const breaker = { failures: 0, openedAt: 0 };

function breakerOpen(): boolean {
  if (breaker.failures < BREAKER_THRESHOLD) return false;
  if (Date.now() - breaker.openedAt > BREAKER_COOLDOWN_MS) {
    // Cooldown elapsed — let one probe through.
    breaker.failures = 0;
    return false;
  }
  return true;
}

function recordFailure() {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) breaker.openedAt = Date.now();
}

function recordSuccess() {
  breaker.failures = 0;
}

/** Test seam — clears memoised series and resets the breaker. */
export function resetMarketDataCache() {
  seriesCache.clear();
  breaker.failures = 0;
  breaker.openedAt = 0;
}

// ---------- Public API ----------

/**
 * Daily OHLCV for one symbol. Never throws: an unreachable provider degrades to
 * the synthetic series rather than failing the request.
 */
export async function getSeries(symbol: string, days = DEFAULT_DAYS): Promise<SeriesResult> {
  const meta = getStock(symbol);
  if (!meta) {
    return { candles: [], source: "synthetic", provider: "none", note: `Unknown symbol ${symbol}` };
  }

  const key = `${symbol}:${days}`;
  const hit = seriesCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const mode = providerMode();
  let result: SeriesResult;

  if (mode === "synthetic" || breakerOpen()) {
    result = syntheticSeries(meta, days, mode === "synthetic" ? undefined : "Live provider unavailable — showing simulated data");
  } else {
    const live = await fetchYahooDaily(meta.symbol, days);
    if (live && live.length >= 30) {
      recordSuccess();
      result = { candles: live.slice(-days), source: "live", provider: "yahoo" };
    } else {
      recordFailure();
      result = syntheticSeries(meta, days, "Live provider unavailable — showing simulated data");
    }
  }

  seriesCache.set(key, { result, at: Date.now() });
  return result;
}

/**
 * Daily OHLCV for the whole universe, fetched with bounded concurrency so a
 * live provider is not hit with 28 simultaneous requests.
 */
export async function getUniverseSeries(
  days = DEFAULT_DAYS,
): Promise<Map<string, SeriesResult>> {
  const out = new Map<string, SeriesResult>();
  const symbols = STOCK_UNIVERSE.map((s) => s.symbol);
  const CONCURRENCY = 6;

  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((s) => getSeries(s, days)));
    batch.forEach((s, j) => out.set(s, results[j]));
  }
  return out;
}

/** The source to report for a mixed batch: "live" only when every series is live. */
export function aggregateSource(results: Iterable<SeriesResult>): DataSource {
  for (const r of results) {
    if (r.source !== "live") return "synthetic";
  }
  return "live";
}

// ---------- Synthetic fallback ----------

function syntheticSeries(meta: StockMeta, days: number, note?: string): SeriesResult {
  return {
    candles: generateCandles(meta, days),
    source: "synthetic",
    provider: "seeded-prng",
    note,
  };
}

// ---------- Yahoo Finance provider ----------

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: unknown;
  };
}

/**
 * Fetch daily candles from Yahoo Finance. NSE symbols carry a `.NS` suffix
 * there; `&` in symbols like `M&M` must be percent-encoded.
 *
 * Returns null on any failure — the caller decides what to do about it.
 */
async function fetchYahooDaily(symbol: string, days: number): Promise<Candle[] | null> {
  const range = days <= 30 ? "1mo" : days <= 90 ? "3mo" : days <= 180 ? "6mo" : "1y";
  const ticker = encodeURIComponent(`${symbol}.NS`);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Yahoo rejects requests without a browser-like UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResponse;
    return parseYahooChart(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Exported for tests: turn a Yahoo chart payload into clean candles. */
export function parseYahooChart(json: YahooChartResponse): Candle[] | null {
  const result = json?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const stamps = result?.timestamp;
  if (!result || !quote || !Array.isArray(stamps) || stamps.length === 0) return null;

  const candles: Candle[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];
    // Yahoo emits nulls for holidays and halted sessions — skip those rows
    // rather than carrying zeros into the indicator math.
    if (o == null || h == null || l == null || c == null) continue;
    if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
    candles.push({
      date: new Date(stamps[i] * 1000).toISOString().slice(0, 10),
      open: round2(o),
      high: round2(h),
      low: round2(l),
      close: round2(c),
      volume: v == null || !isFinite(v) ? 0 : Math.round(v),
    });
  }
  return candles.length > 0 ? candles : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
