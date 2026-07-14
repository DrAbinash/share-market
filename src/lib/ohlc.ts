// Deterministic synthetic OHLC generator.
// Produces a realistic-looking daily candle series for a given symbol, seeded by
// the symbol string + baseline price + volatility. Deterministic => the same
// symbol always yields the same chart, so the LLM's technical summary and the
// displayed chart stay consistent across requests/reloads.

import { Candle } from "./indicators";
import { StockMeta } from "./stocks";

// xmur3 hash -> seeded PRNG
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateCandles(
  meta: StockMeta,
  days = 75,
  refDate = new Date(),
): Candle[] {
  const rng = xmur3(`${meta.symbol}|${meta.baseline}`);
  const candles: Candle[] = [];

  // Build a regime: gentle trend with periodic drift changes to look real.
  let price = meta.baseline * (0.9 + rng() * 0.1);
  const drifts = [0.0015, -0.001, 0.0022, -0.0008, 0.0018, -0.0014];
  let drift = drifts[0];
  let regimeCounter = Math.floor(rng() * 8) + 6;

  for (let i = days - 1; i >= 0; i--) {
    if (regimeCounter <= 0) {
      drift = drifts[Math.floor(rng() * drifts.length)] * (rng() > 0.5 ? 1 : -1);
      regimeCounter = Math.floor(rng() * 8) + 6;
    }
    regimeCounter--;

    const vol = meta.volatility;
    const shock = gaussian(rng) * vol * price;
    const open = price;
    let close = open + drift * price + shock;
    if (close < meta.baseline * 0.55) close = meta.baseline * 0.55;
    if (close > meta.baseline * 1.6) close = meta.baseline * 1.6;

    const wick = Math.abs(gaussian(rng)) * vol * price * 0.6;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;

    const baseVol = meta.lotSize * 8000;
    const volMult = 0.6 + Math.abs(shock) / (vol * price) * 1.2 + rng() * 0.4;
    const volume = Math.round(baseVol * volMult);

    const d = new Date(refDate);
    d.setDate(d.getDate() - i);

    candles.push({
      date: d.toISOString().slice(0, 10),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    });

    price = close;
  }

  // Make the last candle "today" finish near baseline for realism
  return candles;
}

function round(n: number): number {
  if (n >= 1000) return Math.round(n * 100) / 100;
  if (n >= 100) return Math.round(n * 100) / 100;
  return Math.round(n * 20) / 20;
}
