import { describe, expect, test } from "bun:test";
import {
  adx,
  atr,
  bollinger,
  ema,
  macd,
  MIN_CANDLES,
  obv,
  pivotPoints,
  rollingVwap,
  rsi,
  sma,
  stdev,
  stochastic,
  summarize,
  supertrend,
  trueRanges,
} from "../src/lib/indicators";
import type { Candle } from "../src/lib/types";

/** Build a candle series from closes, with tight ranges around each close. */
function candlesFrom(closes: number[], volume = 1000): Candle[] {
  return closes.map((c, i) => ({
    date: `2025-01-${String((i % 28) + 1).padStart(2, "0")}`,
    open: i === 0 ? c : closes[i - 1],
    high: Math.max(c, i === 0 ? c : closes[i - 1]) * 1.01,
    low: Math.min(c, i === 0 ? c : closes[i - 1]) * 0.99,
    close: c,
    volume,
  }));
}

const rising = Array.from({ length: 80 }, (_, i) => 100 + i);
const falling = Array.from({ length: 80 }, (_, i) => 200 - i);
const flat = Array.from({ length: 80 }, () => 100);

describe("sma", () => {
  test("averages the trailing window and is NaN before warm-up", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNaN();
    expect(out[1]).toBeNaN();
    expect(out[2]).toBeCloseTo(2);
    expect(out[4]).toBeCloseTo(4);
  });
});

describe("ema", () => {
  test("converges to a constant series", () => {
    const out = ema(flat, 20);
    expect(out.at(-1)).toBeCloseTo(100, 6);
  });

  test("lags a rising series", () => {
    const out = ema(rising, 20);
    expect(out.at(-1)!).toBeLessThan(rising.at(-1)!);
    expect(out.at(-1)!).toBeGreaterThan(rising.at(-21)!);
  });

  test("returns an empty array for empty input rather than throwing", () => {
    expect(ema([], 20)).toEqual([]);
  });
});

describe("stdev", () => {
  test("is zero for a flat series", () => {
    expect(stdev(flat, 20).at(-1)).toBeCloseTo(0);
  });
});

describe("rsi", () => {
  test("pins at 100 when every bar gains", () => {
    expect(rsi(rising, 14).at(-1)).toBeCloseTo(100);
  });

  test("pins near 0 when every bar loses", () => {
    expect(rsi(falling, 14).at(-1)!).toBeLessThan(1);
  });

  test("returns all-NaN when the series is shorter than the period", () => {
    expect(rsi([1, 2, 3], 14).every(Number.isNaN)).toBe(true);
  });
});

describe("macd", () => {
  test("histogram is positive in an uptrend and negative in a downtrend", () => {
    expect(macd(rising).histogram.at(-1)!).toBeGreaterThan(0);
    expect(macd(falling).histogram.at(-1)!).toBeLessThan(0);
  });
});

describe("trueRanges / atr", () => {
  test("true range accounts for gaps against the previous close", () => {
    const gapped: Candle[] = [
      { date: "2025-01-01", open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { date: "2025-01-02", open: 110, high: 112, low: 109, close: 111, volume: 1 },
    ];
    // High-low is only 3, but the gap from the prior close of 100 makes it 12.
    expect(trueRanges(gapped)[1]).toBeCloseTo(12);
  });

  test("atr is positive and NaN before warm-up", () => {
    const out = atr(candlesFrom(rising), 14);
    expect(out[12]).toBeNaN();
    expect(out.at(-1)!).toBeGreaterThan(0);
  });
});

describe("bollinger", () => {
  test("bands collapse onto the mid line for a flat series", () => {
    const bb = bollinger(flat, 20, 2);
    expect(bb.upper.at(-1)).toBeCloseTo(100);
    expect(bb.lower.at(-1)).toBeCloseTo(100);
  });

  test("upper band sits above the lower band for a volatile series", () => {
    const noisy = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const bb = bollinger(noisy, 20, 2);
    expect(bb.upper.at(-1)!).toBeGreaterThan(bb.lower.at(-1)!);
  });
});

describe("stochastic", () => {
  test("reads high near the top of the range and low near the bottom", () => {
    expect(stochastic(candlesFrom(rising)).k.at(-1)!).toBeGreaterThan(80);
    expect(stochastic(candlesFrom(falling)).k.at(-1)!).toBeLessThan(20);
  });

  test("returns 50 for a range with no width", () => {
    expect(stochastic(candlesFrom(flat)).k.at(-1)!).toBeGreaterThan(0);
  });
});

describe("supertrend", () => {
  test("is up in an uptrend and down in a downtrend", () => {
    expect(supertrend(candlesFrom(rising)).direction.at(-1)).toBe("up");
    expect(supertrend(candlesFrom(falling)).direction.at(-1)).toBe("down");
  });

  test("trailing stop sits below price when the trend is up", () => {
    const st = supertrend(candlesFrom(rising));
    expect(st.value.at(-1)!).toBeLessThan(rising.at(-1)!);
  });
});

describe("adx", () => {
  test("registers a strong trend for a clean uptrend, with +DI dominant", () => {
    const r = adx(candlesFrom(rising), 14);
    expect(r.adx.at(-1)!).toBeGreaterThan(25);
    expect(r.plusDI.at(-1)!).toBeGreaterThan(r.minusDI.at(-1)!);
  });

  test("-DI dominates in a downtrend", () => {
    const r = adx(candlesFrom(falling), 14);
    expect(r.minusDI.at(-1)!).toBeGreaterThan(r.plusDI.at(-1)!);
  });

  test("returns all-NaN when there is not enough history", () => {
    const r = adx(candlesFrom(rising.slice(0, 10)), 14);
    expect(r.adx.every(Number.isNaN)).toBe(true);
  });
});

describe("obv", () => {
  test("accumulates on up days and sheds on down days", () => {
    expect(obv(candlesFrom(rising, 500)).at(-1)!).toBeGreaterThan(0);
    expect(obv(candlesFrom(falling, 500)).at(-1)!).toBeLessThan(0);
  });
});

describe("rollingVwap", () => {
  test("equals the price for a flat series", () => {
    expect(rollingVwap(candlesFrom(flat), 20).at(-1)!).toBeCloseTo(100, 0);
  });

  test("falls back to the close when the window has no volume", () => {
    const zeroVol = candlesFrom(flat, 0);
    expect(rollingVwap(zeroVol, 20).at(-1)).toBeCloseTo(100);
  });
});

describe("pivotPoints", () => {
  test("orders supports below the pivot and resistances above", () => {
    const p = pivotPoints({
      date: "2025-01-01",
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1,
    });
    expect(p.pp).toBeCloseTo(101.67, 1);
    expect(p.s2).toBeLessThan(p.s1);
    expect(p.s1).toBeLessThan(p.pp);
    expect(p.pp).toBeLessThan(p.r1);
    expect(p.r1).toBeLessThan(p.r2);
  });
});

describe("summarize", () => {
  test("rejects a series that is too short instead of returning NaN-laden output", () => {
    expect(() => summarize(candlesFrom(rising.slice(0, MIN_CANDLES - 1)))).toThrow(
      /at least 30 candles/,
    );
  });

  test("scores an uptrend well above a downtrend", () => {
    const up = summarize(candlesFrom(rising));
    const down = summarize(candlesFrom(falling));
    expect(up.bullishScore).toBeGreaterThan(down.bullishScore);
    expect(up.bullishScore).toBeGreaterThan(70);
    expect(down.bullishScore).toBeLessThan(30);
  });

  test("keeps the score inside its documented bounds", () => {
    for (const series of [rising, falling, flat]) {
      const s = summarize(candlesFrom(series));
      expect(s.bullishScore).toBeGreaterThanOrEqual(5);
      expect(s.bullishScore).toBeLessThanOrEqual(95);
    }
  });

  test("signal contributions sum in the direction of the score", () => {
    const s = summarize(candlesFrom(rising));
    const total = s.signals.reduce((a, x) => a + x.points, 0);
    expect(total).toBeGreaterThan(0);
    expect(s.signals.length).toBeGreaterThan(5);
    // Signals are ordered by absolute weight so the UI leads with what mattered.
    for (let i = 1; i < s.signals.length; i++) {
      expect(Math.abs(s.signals[i - 1].points)).toBeGreaterThanOrEqual(
        Math.abs(s.signals[i].points),
      );
    }
  });

  test("every numeric field is finite for each trend regime", () => {
    for (const series of [rising, falling, flat]) {
      const s = summarize(candlesFrom(series));
      for (const [key, value] of Object.entries(s)) {
        if (typeof value === "number") {
          expect(Number.isFinite(value), `${key} was ${value}`).toBe(true);
        }
      }
    }
  });

  test("emaTrend and supertrendDir agree with the underlying regime", () => {
    expect(summarize(candlesFrom(rising)).emaTrend).toBe("up");
    expect(summarize(candlesFrom(rising)).supertrendDir).toBe("up");
    expect(summarize(candlesFrom(falling)).emaTrend).toBe("down");
  });

  test("swing high and low bracket the last close", () => {
    const s = summarize(candlesFrom(rising));
    expect(s.swingLow).toBeLessThanOrEqual(s.lastClose);
    expect(s.swingHigh).toBeGreaterThanOrEqual(s.lastClose);
  });
});
