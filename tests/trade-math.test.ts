import { describe, expect, test } from "bun:test";
import {
  assemblePicks,
  buildBackfillPick,
  buildTradePlan,
  extractJson,
  MIN_RR,
  PICK_COUNT,
  STRETCH_RR,
  tagDataSource,
  type CandidateSummary,
} from "../src/lib/ai";
import { STOCK_UNIVERSE } from "../src/lib/stocks";

function candidate(overrides: Partial<CandidateSummary> = {}): CandidateSummary {
  return {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    sector: "Oil & Gas / Conglomerate",
    ltp: 1300,
    change5d: 2.1,
    change20d: 5.4,
    rsi14: 58,
    ema20: 1280,
    ema50: 1250,
    emaTrend: "up",
    macdHist: 4.2,
    atrPct: 1.5,
    volumeRatio: 1.4,
    swingHigh: 1340,
    swingLow: 1255,
    setupLabel: "Uptrend continuation (EMA stack + MACD)",
    bullishScore: 72,
    adx14: 28,
    supertrendDir: "up",
    bbPercentB: 0.7,
    stochK: 65,
    signals: [],
    ...overrides,
  };
}

/** A full universe of candidates, so backfill always has enough to draw from. */
function universe(): CandidateSummary[] {
  return STOCK_UNIVERSE.map((m, i) =>
    candidate({
      symbol: m.symbol,
      name: m.name,
      sector: m.sector,
      ltp: m.baseline,
      swingHigh: m.baseline * 1.03,
      swingLow: m.baseline * 0.97,
      bullishScore: 80 - i,
    }),
  );
}

describe("extractJson", () => {
  test("parses bare JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("strips markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("slices JSON out of surrounding prose", () => {
    expect(extractJson('Here you go: [{"a":1}] hope that helps')).toEqual([{ a: 1 }]);
  });

  test("throws when there is no JSON at all", () => {
    expect(() => extractJson("no structure here")).toThrow();
  });
});

describe("buildTradePlan", () => {
  test("honours a well-formed proposal", () => {
    const plan = buildTradePlan({
      ltp: 1300,
      entryLow: 1295,
      entryHigh: 1305,
      stopLoss: 1280,
      target: 1340,
      target2: 1360,
      atrPct: 1.5,
      swingLow: 1255,
    });
    expect(plan.entryLow).toBe(1295);
    expect(plan.stopLoss).toBe(1280);
    expect(plan.riskReward).toBeGreaterThanOrEqual(MIN_RR);
  });

  test("widens a target that does not clear the minimum reward-to-risk", () => {
    const plan = buildTradePlan({
      ltp: 1300,
      entryLow: 1295,
      entryHigh: 1305,
      stopLoss: 1280,
      target: 1302, // barely above entry — must be pushed out
      atrPct: 1.5,
      swingLow: 1255,
    });
    expect(plan.riskReward).toBeGreaterThanOrEqual(MIN_RR);
    expect(plan.target).toBeGreaterThan(1302);
  });

  test("rescues a stop placed at or above the entry", () => {
    const plan = buildTradePlan({
      ltp: 1300,
      entryLow: 1295,
      entryHigh: 1305,
      stopLoss: 1320, // above the entry band — nonsensical for a long
      atrPct: 1.5,
      swingLow: 1255,
    });
    expect(plan.stopLoss).toBeLessThan(plan.entryMid);
    expect(plan.riskReward).toBeGreaterThanOrEqual(MIN_RR);
  });

  test("keeps the stretch target beyond the first target", () => {
    const plan = buildTradePlan({
      ltp: 1300,
      stopLoss: 1280,
      target: 1340,
      target2: 1290, // below the first target — must be recomputed
      atrPct: 1.5,
      swingLow: 1255,
    });
    expect(plan.target2).toBeGreaterThan(plan.target);
    const risk = plan.entryMid - plan.stopLoss;
    expect((plan.target2 - plan.entryMid) / risk).toBeGreaterThanOrEqual(STRETCH_RR - 0.01);
  });

  test("swaps an inverted entry band rather than producing a negative width", () => {
    const plan = buildTradePlan({
      ltp: 1300,
      entryLow: 1310,
      entryHigh: 1290,
      atrPct: 1.5,
      swingLow: 1255,
    });
    expect(plan.entryHigh).toBeGreaterThanOrEqual(plan.entryLow);
  });

  test("falls back to an ATR stop when nothing is proposed", () => {
    const plan = buildTradePlan({ ltp: 1300, atrPct: 2, swingLow: 1400 });
    expect(plan.stopLoss).toBeLessThan(plan.entryMid);
    expect(plan.riskReward).toBeGreaterThanOrEqual(MIN_RR);
  });

  test("never returns a non-positive stop", () => {
    const plan = buildTradePlan({ ltp: 10, stopLoss: -5, atrPct: 50, swingLow: -100 });
    expect(plan.stopLoss).toBeGreaterThan(0);
  });
});

describe("assemblePicks", () => {
  test("rejects hallucinated symbols that are not in the candidate set", () => {
    const picks = assemblePicks(
      [{ symbol: "NOTREAL", confidence: 99 }, { symbol: "TCS", confidence: 90 }],
      universe(),
    );
    expect(picks.every((p) => p.symbol !== "NOTREAL")).toBe(true);
    expect(picks.some((p) => p.symbol === "TCS")).toBe(true);
  });

  test("drops duplicate symbols", () => {
    const picks = assemblePicks(
      [
        { symbol: "TCS", confidence: 90 },
        { symbol: "TCS", confidence: 85 },
      ],
      universe(),
    );
    expect(picks.filter((p) => p.symbol === "TCS")).toHaveLength(1);
  });

  test("always returns exactly PICK_COUNT picks, backfilling as needed", () => {
    expect(assemblePicks([], universe())).toHaveLength(PICK_COUNT);
    expect(assemblePicks([{ symbol: "TCS", confidence: 90 }], universe())).toHaveLength(
      PICK_COUNT,
    );
  });

  test("labels backfilled picks as screen-sourced and LLM picks as strategist", () => {
    const picks = assemblePicks([{ symbol: "TCS", confidence: 95 }], universe());
    expect(picks.find((p) => p.symbol === "TCS")!.origin).toBe("llm");
    expect(picks.filter((p) => p.origin === "screen").length).toBe(PICK_COUNT - 1);
  });

  test("ranks by confidence descending and numbers ranks from 1", () => {
    const picks = assemblePicks([], universe());
    expect(picks.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i - 1].confidence).toBeGreaterThanOrEqual(picks[i].confidence);
    }
  });

  test("clamps out-of-range confidence values", () => {
    const picks = assemblePicks(
      [
        { symbol: "TCS", confidence: 500 },
        { symbol: "INFY", confidence: -20 },
        { symbol: "WIPRO", confidence: "nonsense" },
      ],
      universe(),
    );
    for (const p of picks) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(100);
    }
  });

  test("every returned pick satisfies the risk rules", () => {
    const picks = assemblePicks(
      [{ symbol: "TCS", stopLoss: 4000, target: 3800, confidence: 80 }],
      universe(),
    );
    for (const p of picks) {
      expect(p.stopLoss).toBeLessThan(p.entryLow);
      expect(p.target).toBeGreaterThan(p.entryHigh);
      expect(p.riskReward).toBeGreaterThanOrEqual(MIN_RR - 0.01);
      expect(p.target2!).toBeGreaterThan(p.target);
    }
  });

  test("tolerates malformed rows without throwing", () => {
    expect(() => assemblePicks([null, undefined, 42, {}, { symbol: 7 }] as any, universe())).not.toThrow();
    expect(assemblePicks([null, {}] as any, universe())).toHaveLength(PICK_COUNT);
  });
});

describe("buildBackfillPick", () => {
  test("declares in its own text that it has no news catalyst", () => {
    const p = buildBackfillPick(candidate());
    expect(p.origin).toBe("screen");
    expect(p.fundamentalCatalyst.toLowerCase()).toContain("no stock-specific news");
    expect(p.risks.join(" ").toLowerCase()).toContain("no confirmed news catalyst");
  });

  test("defaults to synthetic provenance so an untagged pick under-claims", () => {
    expect(buildBackfillPick(candidate()).dataSource).toBe("synthetic");
  });
});

describe("tagDataSource", () => {
  test("stamps the resolved source onto every pick", () => {
    const picks = tagDataSource(assemblePicks([], universe()), "live");
    expect(picks.every((p) => p.dataSource === "live")).toBe(true);
  });
});
