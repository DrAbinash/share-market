// Technical indicator math. Pure functions, no external deps.
// Used to compute indicators on the loaded OHLC series so the displayed chart,
// the indicator panels, the screener and the LLM's technical summary are all
// internally consistent.

import type {
  Candle,
  PivotLevels,
  SignalContribution,
  TechSummary,
} from "./types";

export type { Candle, PivotLevels, SignalContribution, TechSummary };

// ---------- Moving averages ----------

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function stdev(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const win = values.slice(i - period + 1, i + 1);
    const m = win.reduce((a, b) => a + b, 0) / period;
    const variance = win.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

// ---------- Oscillators ----------

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(closes: number[], fast = 12, slow = 26, signalP = 9): MACDResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signal = ema(macdLine, signalP);
  const histogram = macdLine.map((m, i) => m - signal[i]);
  return { macd: macdLine, signal, histogram };
}

export interface StochResult {
  k: number[];
  d: number[];
}

/** Slow stochastic: raw %K smoothed over `smooth`, then %D as an SMA of %K. */
export function stochastic(
  candles: Candle[],
  period = 14,
  smooth = 3,
  dPeriod = 3,
): StochResult {
  const rawK: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    const win = candles.slice(i - period + 1, i + 1);
    const hh = Math.max(...win.map((c) => c.high));
    const ll = Math.min(...win.map((c) => c.low));
    const denom = hh - ll;
    rawK[i] = denom === 0 ? 50 : ((candles[i].close - ll) / denom) * 100;
  }
  const k = trailingMean(rawK, smooth);
  const d = trailingMean(k, dPeriod);
  return { k, d };
}

/** Mean of the trailing `period` finite values; NaN until any value exists. */
function trailingMean(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    const win = values.slice(Math.max(0, i - period + 1), i + 1).filter(isFinite);
    if (win.length > 0) out[i] = win.reduce((a, b) => a + b, 0) / win.length;
  }
  return out;
}

// ---------- Volatility ----------

/** True range series — shared by ATR, ADX and Supertrend. */
export function trueRanges(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

/** Wilder's ATR. */
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return out;
  const trs = trueRanges(candles);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += trs[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface BollingerResult {
  upper: number[];
  mid: number[];
  lower: number[];
}

export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
  const mid = sma(closes, period);
  const sd = stdev(closes, period);
  return {
    upper: mid.map((m, i) => m + mult * sd[i]),
    mid,
    lower: mid.map((m, i) => m - mult * sd[i]),
  };
}

export interface SupertrendResult {
  value: number[];
  direction: ("up" | "down")[];
}

/** Supertrend — ATR bands with trend locking. A standard intraday trend filter. */
export function supertrend(candles: Candle[], period = 10, mult = 3): SupertrendResult {
  const n = candles.length;
  const atrArr = atr(candles, period);
  const value: number[] = new Array(n).fill(NaN);
  const direction: ("up" | "down")[] = new Array(n).fill("up");

  let finalUpper = NaN;
  let finalLower = NaN;
  let dir: "up" | "down" = "up";

  for (let i = 0; i < n; i++) {
    const a = atrArr[i];
    if (!isFinite(a)) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    const basicUpper = mid + mult * a;
    const basicLower = mid - mult * a;
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;

    finalUpper =
      !isFinite(finalUpper) || basicUpper < finalUpper || prevClose > finalUpper
        ? basicUpper
        : finalUpper;
    finalLower =
      !isFinite(finalLower) || basicLower > finalLower || prevClose < finalLower
        ? basicLower
        : finalLower;

    if (candles[i].close > finalUpper) dir = "up";
    else if (candles[i].close < finalLower) dir = "down";

    direction[i] = dir;
    value[i] = dir === "up" ? finalLower : finalUpper;
  }

  return { value, direction };
}

export interface ADXResult {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
}

/** Wilder's ADX / DMI — ADX measures trend strength, the +DI/-DI spread gives
 *  direction. ADX >= 25 is the conventional "trending" threshold. */
export function adx(candles: Candle[], period = 14): ADXResult {
  const n = candles.length;
  const adxArr: number[] = new Array(n).fill(NaN);
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);
  if (n < period * 2) return { adx: adxArr, plusDI, minusDI };

  const trs = trueRanges(candles);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }

  // Wilder smoothing of TR / +DM / -DM
  let trSum = 0;
  let plusSum = 0;
  let minusSum = 0;
  for (let i = 1; i <= period; i++) {
    trSum += trs[i];
    plusSum += plusDM[i];
    minusSum += minusDM[i];
  }

  const dxs: number[] = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    if (i > period) {
      trSum = trSum - trSum / period + trs[i];
      plusSum = plusSum - plusSum / period + plusDM[i];
      minusSum = minusSum - minusSum / period + minusDM[i];
    }
    const pdi = trSum === 0 ? 0 : (plusSum / trSum) * 100;
    const mdi = trSum === 0 ? 0 : (minusSum / trSum) * 100;
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const denom = pdi + mdi;
    dxs[i] = denom === 0 ? 0 : (Math.abs(pdi - mdi) / denom) * 100;
  }

  // ADX is the Wilder-smoothed DX, which only becomes available one full
  // period after DX itself.
  const firstAdxIdx = period * 2 - 1;
  if (firstAdxIdx < n) {
    let sum = 0;
    for (let i = period; i <= firstAdxIdx; i++) sum += dxs[i];
    let prev = sum / period;
    adxArr[firstAdxIdx] = prev;
    for (let i = firstAdxIdx + 1; i < n; i++) {
      prev = (prev * (period - 1) + dxs[i]) / period;
      adxArr[i] = prev;
    }
  }

  return { adx: adxArr, plusDI, minusDI };
}

// ---------- Volume ----------

/** On-balance volume — cumulative volume signed by daily direction. */
export function obv(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const dir =
      candles[i].close > candles[i - 1].close
        ? 1
        : candles[i].close < candles[i - 1].close
          ? -1
          : 0;
    out[i] = out[i - 1] + dir * candles[i].volume;
  }
  return out;
}

/** Rolling volume-weighted average price. Daily candles only support a
 *  typical-price approximation of true intraday VWAP, hence the `vwap20` name
 *  used throughout rather than a bare "VWAP". */
export function rollingVwap(candles: Candle[], period = 20): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let pv = 0;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      pv += tp * candles[j].volume;
      v += candles[j].volume;
    }
    out[i] = v === 0 ? candles[i].close : pv / v;
  }
  return out;
}

/** Classic floor-trader pivots derived from the previous session. */
export function pivotPoints(prev: Candle): PivotLevels {
  const pp = (prev.high + prev.low + prev.close) / 3;
  return {
    pp: round2(pp),
    r1: round2(2 * pp - prev.low),
    r2: round2(pp + (prev.high - prev.low)),
    s1: round2(2 * pp - prev.high),
    s2: round2(pp - (prev.high - prev.low)),
  };
}

// ---------- Composite summary ----------

/** Minimum series length `summarize()` needs: 21 sessions of lookback for the
 *  20-day change plus warm-up for the 20-period indicators. */
export const MIN_CANDLES = 30;

/**
 * Compute the full technical picture for a candle series.
 *
 * The composite `bullishScore` is assembled from an explicit list of weighted
 * signals (returned as `signals`) rather than an opaque running total, so the
 * UI and the LLM prompt can both show *why* a stock scored what it did.
 *
 * Throws when the series is too short — callers holding partial history should
 * check `candles.length >= MIN_CANDLES` first.
 */
export function summarize(candles: Candle[]): TechSummary {
  const n = candles.length;
  if (n < MIN_CANDLES) {
    throw new Error(`summarize() needs at least ${MIN_CANDLES} candles, received ${n}`);
  }

  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const last = closes[n - 1];

  const rsiArr = rsi(closes, 14);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const { histogram } = macd(closes);
  const atrArr = atr(candles, 14);
  const bb = bollinger(closes, 20, 2);
  const st = supertrend(candles, 10, 3);
  const dmi = adx(candles, 14);
  const stoch = stochastic(candles, 14, 3, 3);
  const obvArr = obv(candles);
  const vwapArr = rollingVwap(candles, 20);

  const lastRSI = finite(rsiArr[n - 1], 50);
  const lastEma20 = finite(ema20Arr[n - 1], last);
  const lastEma50 = finite(ema50Arr[n - 1], last);
  const lastMacd = finite(histogram[n - 1], 0);
  const lastAtr = finite(atrArr[n - 1], last * 0.015);
  const bbUpper = finite(bb.upper[n - 1], last * 1.02);
  const bbMid = finite(bb.mid[n - 1], last);
  const bbLower = finite(bb.lower[n - 1], last * 0.98);
  const bbRange = bbUpper - bbLower;
  const bbPercentB = bbRange === 0 ? 0.5 : (last - bbLower) / bbRange;
  const bbWidthPct = bbMid === 0 ? 0 : (bbRange / bbMid) * 100;
  const adx14 = finite(dmi.adx[n - 1], 0);
  const plusDI = finite(dmi.plusDI[n - 1], 0);
  const minusDI = finite(dmi.minusDI[n - 1], 0);
  const stochK = finite(stoch.k[n - 1], 50);
  const stochD = finite(stoch.d[n - 1], 50);
  const stValue = finite(st.value[n - 1], last);
  const stDir = st.direction[n - 1] ?? "up";
  const vwap20 = finite(vwapArr[n - 1], last);

  const obvNow = obvArr[n - 1];
  const obvThen = obvArr[Math.max(0, n - 11)];
  const obvSlope = ((obvNow - obvThen) / Math.max(1, Math.abs(obvThen))) * 100;

  const vol20 = mean(vols.slice(-20));
  const lastVol = vols[n - 1];

  const window = candles.slice(-20);
  const swingHigh = Math.max(...window.map((c) => c.high));
  const swingLow = Math.min(...window.map((c) => c.low));
  const periodHigh = Math.max(...candles.map((c) => c.high));
  const periodLow = Math.min(...candles.map((c) => c.low));

  const change1d = pctChange(closes[n - 2], last);
  const change5d = pctChange(closes[n - 6], last);
  const change20d = pctChange(closes[n - 21], last);

  // ---- Explainable composite score ----
  const signals: SignalContribution[] = [];
  const add = (key: string, label: string, points: number, detail: string) => {
    if (points !== 0) signals.push({ key, label, points, detail });
  };

  add(
    "price-vs-ema20",
    "Price vs EMA20",
    last > lastEma20 ? 8 : -6,
    last > lastEma20
      ? `Close ${fmt(last)} holds above EMA20 ${fmt(lastEma20)}`
      : `Close ${fmt(last)} is below EMA20 ${fmt(lastEma20)}`,
  );
  add(
    "ema-stack",
    "EMA stack",
    lastEma20 > lastEma50 ? 8 : -6,
    lastEma20 > lastEma50
      ? "EMA20 above EMA50 — medium-term trend intact"
      : "EMA20 below EMA50 — trend still corrective",
  );
  add(
    "supertrend",
    "Supertrend",
    stDir === "up" ? 9 : -9,
    stDir === "up"
      ? `Supertrend is up, trailing support at ${fmt(stValue)}`
      : `Supertrend is down, resistance at ${fmt(stValue)}`,
  );
  add(
    "adx",
    "Trend strength (ADX)",
    adx14 >= 25 ? (plusDI > minusDI ? 8 : -8) : adx14 < 15 ? -3 : 0,
    adx14 >= 25
      ? `ADX ${adx14.toFixed(0)} confirms a strong ${plusDI > minusDI ? "up" : "down"}trend`
      : `ADX ${adx14.toFixed(0)} — trend weak or ranging`,
  );
  add(
    "rsi",
    "RSI (14)",
    lastRSI >= 55 && lastRSI <= 70
      ? 8
      : lastRSI > 70
        ? 2
        : lastRSI >= 45
          ? 3
          : lastRSI < 30
            ? -4
            : -2,
    `RSI ${lastRSI.toFixed(1)} — ${rsiWord(lastRSI)}`,
  );
  add(
    "macd",
    "MACD histogram",
    lastMacd > 0 ? 7 : -5,
    `MACD histogram ${lastMacd >= 0 ? "positive" : "negative"} (${lastMacd.toFixed(2)})`,
  );
  add(
    "volume",
    "Volume confirmation",
    lastVol > vol20 * 1.5 ? 8 : lastVol > vol20 * 1.2 ? 5 : lastVol < vol20 * 0.6 ? -4 : 0,
    `Last volume ${(lastVol / Math.max(1, vol20)).toFixed(2)}x the 20-day average`,
  );
  add(
    "obv",
    "OBV accumulation",
    obvSlope > 5 ? 5 : obvSlope < -5 ? -5 : 0,
    `On-balance volume ${obvSlope >= 0 ? "rising" : "falling"} ${Math.abs(obvSlope).toFixed(1)}% over 10 sessions`,
  );
  add(
    "breakout",
    "Position in range",
    last >= swingHigh * 0.99 ? 8 : last <= swingLow * 1.01 ? -6 : 0,
    last >= swingHigh * 0.99
      ? `Pressing the 20-day high at ${fmt(swingHigh)}`
      : last <= swingLow * 1.01
        ? `Sitting on the 20-day low at ${fmt(swingLow)}`
        : `Mid-range between ${fmt(swingLow)} and ${fmt(swingHigh)}`,
  );
  add(
    "bollinger",
    "Bollinger position",
    bbPercentB > 1 ? -2 : bbPercentB >= 0.6 ? 5 : bbPercentB <= 0.1 ? -3 : 0,
    `%B ${bbPercentB.toFixed(2)}${bbWidthPct < 6 ? ` · bands squeezed (${bbWidthPct.toFixed(1)}% wide)` : ""}`,
  );
  add(
    "stochastic",
    "Stochastic",
    stochK > stochD && stochK < 80 ? 4 : stochK > 90 ? -3 : 0,
    `%K ${stochK.toFixed(0)} / %D ${stochD.toFixed(0)}`,
  );
  add(
    "momentum-5d",
    "5-day momentum",
    change5d > 4 ? 5 : change5d > 0 ? 3 : change5d < -5 ? -5 : -2,
    `${change5d >= 0 ? "+" : ""}${change5d.toFixed(1)}% over 5 sessions`,
  );
  add(
    "vwap",
    "Vs 20-day VWAP",
    last > vwap20 ? 4 : -3,
    `Close is ${last > vwap20 ? "above" : "below"} the 20-day VWAP ${fmt(vwap20)}`,
  );

  // Scaled so a maximally aligned setup lands in the high 80s rather than
  // saturating the 95 cap: several names pinning at the ceiling would erase the
  // ranking information the pick selection depends on.
  const raw = signals.reduce((a, s) => a + s.points, 0);
  const score = clamp(Math.round(50 + raw * 0.55), 5, 95);

  const setupLabel = classifySetup({
    last,
    swingHigh,
    swingLow,
    lastVol,
    vol20,
    lastRSI,
    lastEma20,
    lastEma50,
    lastMacd,
    adx14,
    plusDI,
    minusDI,
    stDir,
    bbWidthPct,
  });

  return {
    lastClose: last,
    change1d,
    change5d,
    change20d,
    rsi14: lastRSI,
    ema20: lastEma20,
    ema50: lastEma50,
    emaTrend: lastEma20 > lastEma50 ? "up" : lastEma20 < lastEma50 ? "down" : "flat",
    macdHist: lastMacd,
    macdBullish: lastMacd > 0,
    atr14: lastAtr,
    atrPct: (lastAtr / last) * 100,
    vol20Avg: vol20,
    lastVolume: lastVol,
    volumeRatio: lastVol / Math.max(1, vol20),
    swingHigh,
    swingLow,
    distanceFromHigh: pctChange(swingHigh, last),
    distanceFromLow: pctChange(swingLow, last),
    bullishScore: score,
    setupLabel,
    bbUpper,
    bbMid,
    bbLower,
    bbWidthPct,
    bbPercentB,
    adx14,
    plusDI,
    minusDI,
    stochK,
    stochD,
    supertrend: stValue,
    supertrendDir: stDir,
    obvSlope,
    vwap20,
    pivots: pivotPoints(candles[n - 1]),
    periodHigh,
    periodLow,
    signals: signals.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
  };
}

interface SetupInput {
  last: number;
  swingHigh: number;
  swingLow: number;
  lastVol: number;
  vol20: number;
  lastRSI: number;
  lastEma20: number;
  lastEma50: number;
  lastMacd: number;
  adx14: number;
  plusDI: number;
  minusDI: number;
  stDir: "up" | "down";
  bbWidthPct: number;
}

function classifySetup(s: SetupInput): string {
  if (s.last > s.swingHigh * 0.99 && s.lastVol > s.vol20 * 1.3) {
    return "Volume-backed breakout above resistance";
  }
  if (s.bbWidthPct < 5 && s.adx14 < 20) {
    return "Bollinger squeeze — volatility compression, awaiting expansion";
  }
  if (s.last > s.swingHigh * 0.99) return "Breakout near multi-day high";
  if (s.adx14 >= 25 && s.plusDI > s.minusDI && s.stDir === "up") {
    return "Strong confirmed uptrend (ADX + Supertrend aligned)";
  }
  if (s.lastRSI < 35 && s.stDir === "up") {
    return "Oversold pullback inside an uptrend — reversal candidate";
  }
  if (s.lastRSI < 35) return "Oversold pullback / potential reversal";
  if (s.last > s.lastEma20 && s.lastEma20 > s.lastEma50 && s.lastMacd > 0) {
    return "Uptrend continuation (EMA stack + MACD)";
  }
  if (s.last < s.lastEma20 && s.lastEma20 < s.lastEma50) {
    return "Downtrend — avoid / watch for stabilization";
  }
  if (s.last > s.lastEma50 && s.lastRSI > 50) {
    return "Above key support, momentum positive";
  }
  return "Range-bound; awaiting trigger";
}

// ---------- Small numeric helpers ----------

function rsiWord(v: number): string {
  if (v > 70) return "overbought, chase risk";
  if (v >= 55) return "momentum zone";
  if (v >= 45) return "neutral";
  if (v < 30) return "oversold";
  return "soft";
}

function finite(n: number, fallback: number): number {
  return typeof n === "number" && isFinite(n) ? n : fallback;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pctChange(from: number, to: number): number {
  if (!isFinite(from) || from === 0) return 0;
  return ((to - from) / from) * 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(2);
}
