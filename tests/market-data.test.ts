import { describe, expect, test } from "bun:test";
import { aggregateSource, parseYahooChart } from "../src/lib/market-data";
import { generateCandles } from "../src/lib/ohlc";
import { STOCK_UNIVERSE, getStock } from "../src/lib/stocks";
import { computeSectorBreadth, csvCell, screenerToCsv } from "../src/lib/screener";
import type { ScreenerRow, SeriesResult } from "../src/lib/types";

describe("parseYahooChart", () => {
  const wellFormed = {
    chart: {
      result: [
        {
          timestamp: [1700000000, 1700086400],
          indicators: {
            quote: [
              {
                open: [100, 102],
                high: [103, 105],
                low: [99, 101],
                close: [102, 104],
                volume: [5000, 6000],
              },
            ],
          },
        },
      ],
    },
  };

  test("maps a well-formed payload to candles", () => {
    const candles = parseYahooChart(wellFormed)!;
    expect(candles).toHaveLength(2);
    expect(candles[0].close).toBe(102);
    expect(candles[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("skips rows with null OHLC rather than emitting zeros", () => {
    const withHole = {
      chart: {
        result: [
          {
            timestamp: [1700000000, 1700086400, 1700172800],
            indicators: {
              quote: [
                {
                  open: [100, null, 104],
                  high: [103, null, 107],
                  low: [99, null, 103],
                  close: [102, null, 106],
                  volume: [5000, null, 7000],
                },
              ],
            },
          },
        ],
      },
    };
    const candles = parseYahooChart(withHole)!;
    expect(candles).toHaveLength(2);
    expect(candles.every((c) => c.close > 0)).toBe(true);
  });

  test("defaults a null volume to 0 while keeping the price row", () => {
    const noVol = JSON.parse(JSON.stringify(wellFormed));
    noVol.chart.result[0].indicators.quote[0].volume = [null, null];
    const candles = parseYahooChart(noVol)!;
    expect(candles).toHaveLength(2);
    expect(candles[0].volume).toBe(0);
  });

  test("returns null for empty, malformed or error payloads", () => {
    expect(parseYahooChart({})).toBeNull();
    expect(parseYahooChart({ chart: { error: "Not Found" } })).toBeNull();
    expect(parseYahooChart({ chart: { result: [] } })).toBeNull();
    expect(parseYahooChart({ chart: { result: [{ timestamp: [] }] } })).toBeNull();
  });
});

describe("aggregateSource", () => {
  const live: SeriesResult = { candles: [], source: "live", provider: "yahoo" };
  const synthetic: SeriesResult = { candles: [], source: "synthetic", provider: "seeded-prng" };

  test("reports live only when every series is live", () => {
    expect(aggregateSource([live, live])).toBe("live");
  });

  test("a single synthetic series downgrades the whole batch", () => {
    expect(aggregateSource([live, synthetic])).toBe("synthetic");
  });

  test("an empty batch is vacuously live", () => {
    expect(aggregateSource([])).toBe("live");
  });
});

describe("generateCandles", () => {
  const meta = getStock("RELIANCE")!;

  test("is deterministic for a given symbol", () => {
    const a = generateCandles(meta, 60);
    const b = generateCandles(meta, 60);
    expect(a).toEqual(b);
  });

  test("produces the requested length with coherent OHLC", () => {
    const candles = generateCandles(meta, 75);
    expect(candles).toHaveLength(75);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.volume).toBeGreaterThan(0);
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("yields ascending dates", () => {
    const candles = generateCandles(meta, 30);
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].date > candles[i - 1].date).toBe(true);
    }
  });

  test("distinct symbols produce distinct series", () => {
    const a = generateCandles(getStock("TCS")!, 40).map((c) => c.close);
    const b = generateCandles(getStock("INFY")!, 40).map((c) => c.close);
    expect(a).not.toEqual(b);
  });
});

describe("stock universe", () => {
  test("has unique symbols", () => {
    const symbols = STOCK_UNIVERSE.map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  test("every entry has sane metadata", () => {
    for (const s of STOCK_UNIVERSE) {
      expect(s.baseline).toBeGreaterThan(0);
      expect(s.lotSize).toBeGreaterThan(0);
      expect(s.volatility).toBeGreaterThan(0);
      expect(s.volatility).toBeLessThan(0.2);
      expect(s.sector.length).toBeGreaterThan(0);
    }
  });

  test("lookup is case-sensitive and returns undefined for unknown symbols", () => {
    expect(getStock("RELIANCE")).toBeDefined();
    expect(getStock("NOTREAL")).toBeUndefined();
  });
});

function screenerRow(overrides: Partial<ScreenerRow> = {}): ScreenerRow {
  return {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "Information Technology",
    ltp: 3850,
    change1d: 1.2,
    change5d: 2,
    change20d: 4,
    rsi14: 60,
    adx14: 27,
    atrPct: 1.3,
    volumeRatio: 1.2,
    emaTrend: "up",
    macdHist: 3,
    supertrendDir: "up",
    bbPercentB: 0.7,
    stochK: 65,
    distanceFromHigh: -1.2,
    bullishScore: 72,
    setupLabel: "Uptrend continuation (EMA stack + MACD)",
    swingHigh: 3900,
    swingLow: 3700,
    ...overrides,
  };
}

describe("computeSectorBreadth", () => {
  test("groups by sector and counts advancers and decliners", () => {
    const rows = [
      screenerRow({ symbol: "TCS", change1d: 1 }),
      screenerRow({ symbol: "INFY", change1d: -1 }),
      screenerRow({ symbol: "SBIN", sector: "Banking", change1d: 2, bullishScore: 80 }),
    ];
    const sectors = computeSectorBreadth(rows);
    expect(sectors).toHaveLength(2);
    // Sorted by average score descending, so Banking leads.
    expect(sectors[0].sector).toBe("Banking");
    const it = sectors.find((s) => s.sector === "Information Technology")!;
    expect(it.count).toBe(2);
    expect(it.advancing).toBe(1);
    expect(it.declining).toBe(1);
    expect(it.avgChange1d).toBe(0);
  });

  test("returns an empty list for no rows", () => {
    expect(computeSectorBreadth([])).toEqual([]);
  });
});

describe("screener CSV", () => {
  test("quotes setup labels containing commas", () => {
    expect(csvCell("Squeeze, awaiting expansion")).toBe('"Squeeze, awaiting expansion"');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
  });

  test("emits a header and one line per row", () => {
    const csv = screenerToCsv([screenerRow(), screenerRow({ symbol: "INFY" })]);
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv.split("\n")[0]).toContain("Symbol");
  });
});
