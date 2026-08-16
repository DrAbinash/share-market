import { describe, expect, test } from "bun:test";
import { computeOutcome, computeSummary, resolveRange, trackRecordToCsv } from "../src/lib/track-record";
import type { Candle, TrackRecordRow } from "../src/lib/types";

const plan = { entryLow: 99, entryHigh: 101, stopLoss: 95, target: 110 };

function candle(o: number, h: number, l: number, c: number): Candle {
  return { date: "2025-06-10", open: o, high: h, low: l, close: c, volume: 1000 };
}

describe("computeOutcome", () => {
  test("not triggered when price never reaches the entry band", () => {
    const r = computeOutcome(plan, candle(120, 125, 115, 122));
    expect(r.outcome).toBe("not-triggered");
    expect(r.realizedR).toBe(0);
    expect(r.exitPrice).toBeNull();
  });

  test("target hit resolves to a positive R", () => {
    const r = computeOutcome(plan, candle(100, 112, 98, 111));
    expect(r.outcome).toBe("target");
    expect(r.exitPrice).toBe(110);
    expect(r.realizedR).toBeCloseTo(2, 1); // (110-100)/(100-95)
  });

  test("stop hit is exactly -1R", () => {
    const r = computeOutcome(plan, candle(100, 103, 94, 96));
    expect(r.outcome).toBe("sl");
    expect(r.realizedR).toBe(-1);
  });

  test("time exit values the position at the close", () => {
    const r = computeOutcome(plan, candle(100, 105, 97, 103));
    expect(r.outcome).toBe("time-exit");
    expect(r.exitPrice).toBe(103);
    expect(r.realizedR).toBeCloseTo(0.6, 2);
  });

  test("when both levels are hit, the candle direction breaks the tie", () => {
    // Bullish close → target assumed first.
    expect(computeOutcome(plan, candle(100, 112, 94, 108)).outcome).toBe("target");
    // Bearish close → stop assumed first.
    expect(computeOutcome(plan, candle(100, 112, 94, 96)).outcome).toBe("sl");
  });

  test("a gap-up open above the band fills at the top of the band", () => {
    const r = computeOutcome(plan, candle(101, 112, 100.5, 111));
    expect(r.outcome).toBe("target");
    expect(r.realizedR).toBeCloseTo((110 - 101) / (101 - 95), 2);
  });
});

describe("resolveRange", () => {
  const dates = Array.from({ length: 40 }, (_, i) => `2025-06-${String(i + 1).padStart(2, "0")}`);

  test("1d resolves to the previous session", () => {
    const r = resolveRange("1d", dates);
    expect(r.fromDate).toBe(dates[38]);
    expect(r.toDate).toBe(dates[38]);
  });

  test("7d spans the last week ending yesterday", () => {
    const r = resolveRange("7d", dates);
    expect(r.fromDate).toBe(dates[32]);
    expect(r.toDate).toBe(dates[38]);
  });

  test("clamps to available history instead of returning undefined", () => {
    const short = dates.slice(0, 5);
    const r = resolveRange("1m", short);
    expect(r.fromDate).toBe(short[0]);
    expect(typeof r.toDate).toBe("string");
  });

  test("custom range honours valid bounds and rejects a future end date", () => {
    const r = resolveRange("custom", dates, dates[10], dates[20]);
    expect(r.fromDate).toBe(dates[10]);
    expect(r.toDate).toBe(dates[20]);

    // "to" beyond yesterday is pulled back to yesterday.
    expect(resolveRange("custom", dates, dates[10], "2099-01-01").toDate).toBe(dates[38]);
  });

  test("custom range ignores a start date after the end date", () => {
    const r = resolveRange("custom", dates, dates[35], dates[20]);
    expect(r.fromDate <= r.toDate).toBe(true);
  });
});

function trade(realizedR: number, date: string, outcome: TrackRecordRow["outcome"]): TrackRecordRow {
  return {
    date,
    symbol: "TCS",
    name: "Tata Consultancy Services",
    sector: "Information Technology",
    entryLow: 99,
    entryHigh: 101,
    stopLoss: 95,
    target: 110,
    ltp: 100,
    confidence: 70,
    conviction: "high",
    riskReward: 2,
    source: "simulated",
    outcome,
    outcomeLabel: outcome,
    realizedR,
    exitPrice: 100,
    exitNote: "",
  };
}

describe("computeSummary", () => {
  test("zeroes cleanly with no rows", () => {
    const s = computeSummary([], "2025-06-01", "2025-06-07");
    expect(s.winRate).toBe(0);
    expect(s.profitFactor).toBe(0);
    expect(s.maxDrawdownR).toBe(0);
    expect(Number.isFinite(s.avgRealizedR)).toBe(true);
  });

  test("excludes not-triggered and live rows from trade statistics", () => {
    const rows = [
      trade(2, "2025-06-02", "target"),
      trade(0, "2025-06-03", "not-triggered"),
      trade(0, "2025-06-04", "live"),
    ];
    const s = computeSummary(rows, "2025-06-01", "2025-06-07");
    expect(s.tradesTaken).toBe(1);
    expect(s.notTriggered).toBe(1);
    expect(s.livePicks).toBe(1);
    expect(s.winRate).toBe(100);
  });

  test("computes expectancy and profit factor", () => {
    const rows = [
      trade(2, "2025-06-02", "target"),
      trade(-1, "2025-06-03", "sl"),
      trade(-1, "2025-06-04", "sl"),
    ];
    const s = computeSummary(rows, "2025-06-01", "2025-06-07");
    expect(s.totalR).toBe(0);
    expect(s.expectancyR).toBe(0);
    expect(s.profitFactor).toBe(1); // 2 gross win / 2 gross loss
  });

  test("measures peak-to-trough drawdown of the cumulative R curve", () => {
    // +3 then -1 -1 → peak 3, trough 1, drawdown 2.
    const rows = [
      trade(3, "2025-06-02", "target"),
      trade(-1, "2025-06-03", "sl"),
      trade(-1, "2025-06-04", "sl"),
    ];
    expect(computeSummary(rows, "2025-06-01", "2025-06-07").maxDrawdownR).toBe(2);
  });
});

describe("trackRecordToCsv", () => {
  test("emits a header plus one row per pick", () => {
    const csv = trackRecordToCsv([trade(2, "2025-06-02", "target")]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Symbol");
    expect(lines[1]).toContain("TCS");
  });

  test("quotes cells containing commas so columns do not shift", () => {
    const row = trade(2, "2025-06-02", "target");
    row.exitNote = "Both levels hit, bullish close";
    const csv = trackRecordToCsv([row]);
    expect(csv).toContain('"Both levels hit, bullish close"');
    expect(csv.split("\n")[1].split(",").length).toBeGreaterThan(10);
  });

  test("escapes embedded double quotes", () => {
    const row = trade(2, "2025-06-02", "target");
    row.name = 'Tata "TCS" Ltd';
    expect(trackRecordToCsv([row])).toContain('"Tata ""TCS"" Ltd"');
  });
});
