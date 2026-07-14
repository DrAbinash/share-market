// Technical indicator math. Pure functions, no external deps.
// Used to compute real indicators on the (deterministic synthetic) OHLC series
// so the displayed chart, the indicator panels, and the LLM's technical summary
// are all internally consistent.

export interface Candle {
  date: string; // ISO date
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder's RSI
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

// Wilder's ATR
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return out;
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
    } else {
      const h = candles[i].high;
      const l = candles[i].low;
      const pc = candles[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
  }
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
}

export function summarize(candles: Candle[]): TechSummary {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const last = closes[n - 1];

  const rsiArr = rsi(closes, 14);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const { histogram } = macd(closes);
  const atrArr = atr(candles, 14);

  const lastRSI = rsiArr[n - 1];
  const lastEma20 = ema20Arr[n - 1];
  const lastEma50 = ema50Arr[n - 1];
  const lastMacd = histogram[n - 1];
  const lastAtr = atrArr[n - 1];

  const vol20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = vols[n - 1];

  // Swing high/low from last 20 candles
  const window = candles.slice(-20);
  const swingHigh = Math.max(...window.map((c) => c.high));
  const swingLow = Math.min(...window.map((c) => c.low));

  const change1d = ((last - candles[n - 2].close) / candles[n - 2].close) * 100;
  const change5d = ((last - closes[n - 6]) / closes[n - 6]) * 100;
  const change20d = ((last - closes[n - 21]) / closes[n - 21]) * 100;

  // Composite bullish score
  let score = 50;
  if (last > lastEma20) score += 10;
  if (lastEma20 > lastEma50) score += 10;
  if (lastRSI > 50 && lastRSI < 70) score += 10;
  if (lastRSI > 70) score += 4; // strong but extended
  if (lastRSI < 30) score -= 8;
  if (lastMacd > 0) score += 8;
  if (change5d > 0) score += 5;
  if (change5d > 3) score += 3;
  if (lastVol > vol20 * 1.2) score += 5;
  if (last > swingHigh * 0.98 && last < swingHigh * 1.01) score += 6; // near breakout
  score = Math.max(5, Math.min(95, Math.round(score)));

  // Setup label
  let setup = "";
  if (last > swingHigh * 0.99 && lastVol > vol20 * 1.3) setup = "Volume-backed breakout above resistance";
  else if (last > swingHigh * 0.99) setup = "Breakout near multi-day high";
  else if (lastRSI < 35) setup = "Oversold pullback / potential reversal";
  else if (last > lastEma20 && lastEma20 > lastEma50 && lastMacd > 0) setup = "Uptrend continuation (EMA stack + MACD)";
  else if (last < lastEma20 && lastEma20 < lastEma50) setup = "Downtrend — avoid / watch for stabilization";
  else if (last > lastEma50 && lastRSI > 50) setup = "Above key support, momentum positive";
  else setup = "Range-bound; awaiting trigger";

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
    volumeRatio: lastVol / vol20,
    swingHigh,
    swingLow,
    distanceFromHigh: ((last - swingHigh) / swingHigh) * 100,
    distanceFromLow: ((last - swingLow) / swingLow) * 100,
    bullishScore: score,
    setupLabel: setup,
  };
}
