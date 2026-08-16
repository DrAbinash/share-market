import { describe, expect, test } from "bun:test";
import { computeStats, suggestQuantity, toJournalTrade, type PaperTradeRow } from "../src/lib/journal-math";

function row(overrides: Partial<PaperTradeRow> = {}): PaperTradeRow {
  return {
    id: "t1",
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sector: "Oil & Gas",
    entryPrice: 1000,
    stopLoss: 980,
    target: 1050,
    quantity: 100,
    status: "open",
    outcome: "open",
    exitPrice: null,
    notes: "",
    openedAt: new Date("2025-06-10T04:00:00Z"),
    closedAt: null,
    ...overrides,
  };
}

describe("suggestQuantity", () => {
  test("sizes from the stop distance", () => {
    // ₹20 of risk per share, ₹2000 budget → 100 shares.
    expect(suggestQuantity(1000, 980, 2000)).toBe(100);
  });

  test("rounds down so realised risk never exceeds the budget", () => {
    expect(suggestQuantity(1000, 985, 2000)).toBe(133); // 2000/15 = 133.33
  });

  test("returns 0 for an invalid or inverted stop", () => {
    expect(suggestQuantity(1000, 1000, 2000)).toBe(0);
    expect(suggestQuantity(1000, 1100, 2000)).toBe(0);
    expect(suggestQuantity(1000, 980, 0)).toBe(0);
    expect(suggestQuantity(NaN, 980, 2000)).toBe(0);
  });

  test("returns 0 when the budget cannot cover a single share", () => {
    expect(suggestQuantity(1000, 900, 50)).toBe(0);
  });
});

describe("toJournalTrade", () => {
  test("marks an open trade to the supplied price", () => {
    const t = toJournalTrade(row(), 1010);
    expect(t.status).toBe("open");
    expect(t.lastPrice).toBe(1010);
    expect(t.unrealizedPnl).toBe(1000); // 10 * 100
    expect(t.realizedPnl).toBe(0);
    expect(t.exitPrice).toBeNull();
  });

  test("ignores the mark for a closed trade and uses the exit price", () => {
    const t = toJournalTrade(
      row({ status: "closed", outcome: "target", exitPrice: 1050, closedAt: new Date("2025-06-10T10:00:00Z") }),
      99999, // a wild mark must not affect a settled trade
    );
    expect(t.realizedPnl).toBe(5000);
    expect(t.unrealizedPnl).toBe(0);
    expect(t.lastPrice).toBe(1050);
  });

  test("expresses P&L in R-multiples against the planned risk", () => {
    // Risk is 20/share × 100 = 2000. A 2000 profit is exactly +1R.
    expect(toJournalTrade(row(), 1020).rMultiple).toBe(1);
    // Being stopped out is exactly -1R.
    expect(toJournalTrade(row({ status: "closed", exitPrice: 980 }), 980).rMultiple).toBe(-1);
  });

  test("never divides by zero when the stop equals the entry", () => {
    const t = toJournalTrade(row({ stopLoss: 1000 }), 1010);
    expect(Number.isFinite(t.rMultiple)).toBe(true);
    expect(t.riskAmount).toBeGreaterThan(0);
  });
});

describe("computeStats", () => {
  const closedWin = toJournalTrade(
    row({ id: "w", status: "closed", outcome: "target", exitPrice: 1050, closedAt: new Date("2025-06-10T10:00:00Z") }),
    1050,
  );
  const closedLoss = toJournalTrade(
    row({ id: "l", status: "closed", outcome: "sl", exitPrice: 980, closedAt: new Date("2025-06-11T10:00:00Z") }),
    980,
  );
  const openTrade = toJournalTrade(row({ id: "o" }), 1010);

  test("returns zeroed stats for an empty journal without NaN", () => {
    const s = computeStats([]);
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.avgR).toBe(0);
    expect(s.profitFactor).toBe(0);
    expect(s.equityCurve).toEqual([]);
  });

  test("separates realised from unrealised P&L", () => {
    const s = computeStats([closedWin, closedLoss, openTrade]);
    expect(s.realizedPnl).toBe(3000); // +5000 - 2000
    expect(s.unrealizedPnl).toBe(1000);
    expect(s.totalPnl).toBe(4000);
    expect(s.openTrades).toBe(1);
    expect(s.closedTrades).toBe(2);
  });

  test("computes win rate over closed trades only", () => {
    expect(computeStats([closedWin, closedLoss, openTrade]).winRate).toBe(50);
  });

  test("reports profit factor as 0 rather than Infinity when there are no losses", () => {
    // Infinity does not survive JSON serialisation, so it is deliberately 0.
    expect(computeStats([closedWin]).profitFactor).toBe(0);
  });

  test("profit factor is gross profit over gross loss", () => {
    expect(computeStats([closedWin, closedLoss]).profitFactor).toBe(2.5); // 5000/2000
  });

  test("builds the equity curve from realised P&L, oldest first", () => {
    const s = computeStats([closedLoss, closedWin, openTrade]);
    expect(s.equityCurve).toHaveLength(2);
    expect(s.equityCurve[0]).toEqual({ date: "2025-06-10", cumulative: 5000 });
    expect(s.equityCurve[1]).toEqual({ date: "2025-06-11", cumulative: 3000 });
  });

  test("tracks best and worst closed trades", () => {
    const s = computeStats([closedWin, closedLoss]);
    expect(s.bestTrade).toBe(5000);
    expect(s.worstTrade).toBe(-2000);
  });
});
