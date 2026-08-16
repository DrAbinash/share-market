// AI layer: uses z-ai-web-dev-sdk (backend only).
//
// 1) getPremarketIntel(): parallel web searches for real market news/economics,
//    then an LLM digests them into a structured pre-market brief.
// 2) buildCandidateSummaries(): loads the universe's daily candles (live where
//    available, synthetic otherwise) and computes the full technical picture.
// 3) generatePicks(intel, candidates): the strategist LLM picks intraday
//    candidates with full reasoning, grounded in the real news brief AND the
//    computed technical summary. If the LLM underdelivers, the next-best
//    technical candidates are backfilled — those are tagged `origin: "screen"`
//    so the UI never presents them as LLM-reasoned picks.

import ZAI from "z-ai-web-dev-sdk";
import { STOCK_UNIVERSE, STOCK_BY_SYMBOL } from "./stocks";
import { summarize } from "./indicators";
import { getUniverseSeries, aggregateSource } from "./market-data";
import type {
  DataSource,
  NewsItem,
  PickIndicators,
  PremarketIntel,
  SignalContribution,
  StockPick,
  TechSummary,
} from "./types";

export type {
  DataSource,
  EconomicEvent,
  GlobalCue,
  NewsItem,
  PickIndicators,
  PremarketIntel,
  SectorTilt,
  StockPick,
} from "./types";

/** Number of picks the dashboard renders. Previously the prompt asked for 5 in
 *  one place and 6 in another; both now derive from this constant. */
export const PICK_COUNT = 6;

/** Minimum reward-to-risk the strategist must clear, enforced server-side. */
export const MIN_RR = 1.8;
/** Stretch-target multiple applied when the LLM omits or lowballs `target2`. */
export const STRETCH_RR = 2.6;

// ---------- Helpers ----------

async function safeWebSearch(query: string, num = 8): Promise<NewsItem[]> {
  try {
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", { query, num });
    if (!Array.isArray(results)) return [];
    return results.map((r: any) => ({
      title: r.name || "",
      snippet: r.snippet || "",
      url: r.url || "",
      source: r.host_name || "",
      date: r.date,
    }));
  } catch {
    return [];
  }
}

export function extractJson(text: string): any {
  // Strip markdown fences
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }
  // Try direct parse first
  try {
    return JSON.parse(t);
  } catch {
    /* fall through to bracket slicing */
  }
  // Find the first [ or { and the matching last ] or } so both arrays and objects work
  const firstIdx = t.search(/[[{]/);
  if (firstIdx === -1) throw new Error("No JSON structure found");
  const openChar = t[firstIdx];
  const closeChar = openChar === "[" ? "]" : "}";
  const lastIdx = t.lastIndexOf(closeChar);
  if (lastIdx > firstIdx) {
    t = t.slice(firstIdx, lastIdx + 1);
  }
  return JSON.parse(t);
}

// ---------- Pre-market intelligence ----------

export async function getPremarketIntel(): Promise<PremarketIntel> {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Calcutta",
  });

  const [indianMkt, globalCues, econEvents, fiidii, sectorNews] = await Promise.all([
    safeWebSearch("Indian stock market NSE BSE today pre-open Nifty Sensex cues", 8),
    safeWebSearch("Asian markets Dow Nasdaq SGX Nifty GIFT Nifty today closing", 6),
    safeWebSearch("India economic data events today RBI inflation CPI IIP PMI", 6),
    safeWebSearch("FII DII data India today foreign institutional investors buying selling", 5),
    safeWebSearch("Indian stock market sector news today banking IT auto metals energy", 8),
  ]);

  const allNews = [...indianMkt, ...sectorNews, ...globalCues, ...econEvents, ...fiidii].slice(0, 16);

  const zai = await ZAI.create();
  const corpus = allNews
    .map((n, i) => `[${i + 1}] (${n.source}) ${n.title}\n${n.snippet}`)
    .join("\n\n");

  const prompt = `You are a senior pre-market strategist for the Indian equity market (NSE/BSE).
Today is ${today}. Below is a corpus of real-time web-search results gathered minutes ago.

Your job: produce a concise, structured pre-market intelligence brief in STRICT JSON only.

Return JSON with this exact schema:
{
  "globalCues": [{"name": string, "change": string, "note": string}],  // 4-6 items: Dow, Nasdaq, SGX/GIFT Nifty, Nikkei/Hang Seng, Crude, Dollar index etc.
  "economicEvents": [{"time": string, "event": string, "impact": "high"|"medium"|"low", "forecast": string}],  // 2-5 India/global events scheduled today
  "fiidii": string,  // 1-2 sentence narrative on FII/DII flow posture
  "keyThemes": [string],  // 4-6 bullet themes driving today's session
  "sectorTilts": [{"sector": string, "bias": "bullish"|"bearish"|"neutral", "reason": string}],  // 5-8 sectors
  "sentiment": "Risk-On"|"Cautious"|"Risk-Off"|"Mixed",
  "sentimentScore": number,  // -100 (extreme risk-off) .. +100 (extreme risk-on)
  "summary": string  // 2-3 sentence cohesive narrative
}

Rules:
- Base every statement on the corpus. If data is sparse, say so plainly rather than invent specifics.
- Be specific and quantitative where the corpus supports it (index levels, % moves).
- Do NOT include stock picks here — that is a separate step.
- Output ONLY the JSON object, no prose.

CORPUS:
${corpus}`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: "You are a precise financial analyst that outputs only valid JSON." },
      { role: "user", content: prompt },
    ],
    thinking: { type: "disabled" },
  });

  let parsed: any;
  try {
    parsed = extractJson(completion.choices[0]?.message?.content || "{}");
  } catch {
    parsed = {
      globalCues: [],
      economicEvents: [],
      fiidii: "FII/DII flow data not clearly available in this fetch.",
      keyThemes: ["Awaiting fresh triggers"],
      sectorTilts: [],
      sentiment: "Mixed",
      sentimentScore: 0,
      summary: "Pre-market digest could not be fully structured; treating session as data-dependent.",
    };
  }

  return {
    asOf: new Date().toLocaleString("en-IN", { timeZone: "Asia/Calcutta" }),
    globalCues: parsed.globalCues || [],
    economicEvents: parsed.economicEvents || [],
    fiidii: parsed.fiidii || "Flow data not available in this fetch.",
    newsDigest: allNews.slice(0, 12),
    keyThemes: parsed.keyThemes || [],
    sectorTilts: parsed.sectorTilts || [],
    sentiment: parsed.sentiment || "Mixed",
    sentimentScore: typeof parsed.sentimentScore === "number" ? parsed.sentimentScore : 0,
    summary: parsed.summary || "",
  } satisfies PremarketIntel;
}

// ---------- Candidate technical summaries (for the picker) ----------

export interface CandidateSummary {
  symbol: string;
  name: string;
  sector: string;
  ltp: number;
  change5d: number;
  change20d: number;
  rsi14: number;
  ema20: number;
  ema50: number;
  emaTrend: "up" | "down" | "flat";
  macdHist: number;
  atrPct: number;
  volumeRatio: number;
  swingHigh: number;
  swingLow: number;
  setupLabel: string;
  bullishScore: number;
  adx14: number;
  supertrendDir: "up" | "down";
  bbPercentB: number;
  stochK: number;
  signals: SignalContribution[];
}

export interface CandidateBatch {
  candidates: CandidateSummary[];
  dataSource: DataSource;
}

export async function buildCandidateSummaries(): Promise<CandidateBatch> {
  const series = await getUniverseSeries(120);
  const candidates: CandidateSummary[] = [];

  for (const meta of STOCK_UNIVERSE) {
    const s = series.get(meta.symbol);
    if (!s || s.candles.length < 30) continue;
    let summary: TechSummary;
    try {
      summary = summarize(s.candles);
    } catch {
      continue;
    }
    candidates.push(toCandidate(meta.symbol, meta.name, meta.sector, summary));
  }

  return { candidates, dataSource: aggregateSource(series.values()) };
}

function toCandidate(
  symbol: string,
  name: string,
  sector: string,
  s: TechSummary,
): CandidateSummary {
  return {
    symbol,
    name,
    sector,
    ltp: round2(s.lastClose),
    change5d: s.change5d,
    change20d: s.change20d,
    rsi14: round1(s.rsi14),
    ema20: round2(s.ema20),
    ema50: round2(s.ema50),
    emaTrend: s.emaTrend,
    macdHist: round2(s.macdHist),
    atrPct: round2(s.atrPct),
    volumeRatio: round2(s.volumeRatio),
    swingHigh: round2(s.swingHigh),
    swingLow: round2(s.swingLow),
    setupLabel: s.setupLabel,
    bullishScore: s.bullishScore,
    adx14: round1(s.adx14),
    supertrendDir: s.supertrendDir,
    bbPercentB: round2(s.bbPercentB),
    stochK: round1(s.stochK),
    signals: s.signals,
  };
}

function pickIndicators(c: CandidateSummary): PickIndicators {
  return {
    rsi14: c.rsi14,
    ema20: c.ema20,
    ema50: c.ema50,
    macdHist: c.macdHist,
    atrPct: c.atrPct,
    volumeRatio: c.volumeRatio,
    swingHigh: c.swingHigh,
    swingLow: c.swingLow,
    setupLabel: c.setupLabel,
    adx14: c.adx14,
    bbPercentB: c.bbPercentB,
    supertrendDir: c.supertrendDir,
    stochK: c.stochK,
  };
}

// ---------- Trade-plan maths ----------

export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  entryMid: number;
  stopLoss: number;
  target: number;
  target2: number;
  riskReward: number;
}

/**
 * Normalise a trade plan so it always satisfies the risk rules, regardless of
 * what the LLM proposed:
 *   - the stop sits below the entry band by at least 0.4% (never inverted),
 *   - the first target clears `MIN_RR` times the risk,
 *   - the stretch target clears `STRETCH_RR` times the risk.
 *
 * Exported so the same maths can be unit-tested and reused by the backfill path.
 */
export function buildTradePlan(input: {
  ltp: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  target?: number;
  target2?: number;
  atrPct: number;
  swingLow: number;
}): TradePlan {
  const entryLow = round2(positive(input.entryLow) ?? input.ltp * 0.998);
  const entryHighRaw = round2(positive(input.entryHigh) ?? input.ltp * 1.002);
  const entryHigh = entryHighRaw >= entryLow ? entryHighRaw : entryLow;
  const entryMid = (entryLow + entryHigh) / 2;

  // Stop: prefer the proposed level, else the swing low, else an ATR-derived
  // level. Anything at or above the entry is nonsense for a long, so clamp it.
  const atrAbs = entryMid * (Math.max(0.2, input.atrPct) / 100);
  const proposed = positive(input.stopLoss) ?? Math.min(input.swingLow, entryMid - atrAbs);
  const minGap = entryMid * 0.004;
  let stopLoss = round2(proposed >= entryMid - minGap ? entryMid - minGap : proposed);
  if (stopLoss <= 0) stopLoss = round2(entryMid * 0.99);

  const risk = Math.max(0.01, entryMid - stopLoss);

  let target = round2(positive(input.target) ?? entryMid + MIN_RR * risk);
  if (target - entryMid < MIN_RR * risk) target = round2(entryMid + MIN_RR * risk);

  let target2 = round2(positive(input.target2) ?? entryMid + STRETCH_RR * risk);
  if (target2 - entryMid < STRETCH_RR * risk || target2 <= target) {
    target2 = round2(entryMid + STRETCH_RR * risk);
  }

  return {
    entryLow,
    entryHigh,
    entryMid: round2(entryMid),
    stopLoss,
    target,
    target2,
    riskReward: Math.round(((target - entryMid) / risk) * 100) / 100,
  };
}

function positive(n: unknown): number | undefined {
  const v = Number(n);
  return isFinite(v) && v > 0 ? v : undefined;
}

// ---------- Picker ----------

export async function generatePicks(
  intel: PremarketIntel,
  candidates: CandidateSummary[],
): Promise<StockPick[]> {
  const zai = await ZAI.create();

  // Only the technically viable half of the universe is offered to the LLM —
  // feeding it 28 rows including outright downtrends invites bad selections.
  const shortlist = [...candidates]
    .sort((a, b) => b.bullishScore - a.bullishScore)
    .slice(0, Math.max(PICK_COUNT * 3, 18));

  const candidateLines = shortlist
    .map(
      (c) =>
        `${c.symbol} | ${c.name} | ${c.sector} | LTP ${c.ltp} | 5d ${c.change5d.toFixed(1)}% | 20d ${c.change20d.toFixed(1)}% | RSI ${c.rsi14} | EMA20 ${c.ema20} | EMA50 ${c.ema50} | trend ${c.emaTrend} | MACDhist ${c.macdHist} | ADX ${c.adx14} | Supertrend ${c.supertrendDir} | %B ${c.bbPercentB} | StochK ${c.stochK} | ATR ${c.atrPct}% | volRatio ${c.volumeRatio} | swingHigh ${c.swingHigh} | swingLow ${c.swingLow} | setup: ${c.setupLabel} | bullScore ${c.bullishScore}`,
    )
    .join("\n");

  const prompt = `You are a disciplined intraday strategist for the Indian NSE. The market opens shortly.
Today's pre-market intelligence (real news + economics, just gathered):

SENTIMENT: ${intel.sentiment} (score ${intel.sentimentScore}/100)
SUMMARY: ${intel.summary}
KEY THEMES: ${intel.keyThemes.join(" | ")}
SECTOR TILTS: ${intel.sectorTilts.map((s) => `${s.sector}:${s.bias}`).join(" | ")}
FII/DII: ${intel.fiidii}

CANDIDATE UNIVERSE (liquid NSE names, technicals computed from recent daily charts):
${candidateLines}

TASK: Select exactly ${PICK_COUNT} stocks for INTRADAY LONG trades today that have a SOUND, NON-SPECULATIVE foundation.
Selection criteria (in priority order):
1. Technical alignment: prefer volume-backed breakouts, uptrend continuation (EMA stack + MACD + Supertrend up + ADX >= 25), or oversold reversal with confirmation. Avoid downtrends and dead ranges.
2. News/fundamental trigger: each pick must have a real catalyst from today's themes/sector tilts (earnings, policy, flows, global commodity move, sector rotation). Reject picks with no discernible driver.
3. Risk discipline: stop loss must sit on a logical technical level (below swing low / EMA / Supertrend / ATR-based), target must give R:R >= ${MIN_RR}.
4. Liquidity: only use the provided universe (all are liquid).
5. Diversification: spread across at least 5 different sectors; avoid 2 picks in the same sector unless exceptional.

Return STRICT JSON only — an array of exactly ${PICK_COUNT} objects with this schema:
[
  {
    "symbol": string,             // must match a candidate symbol exactly
    "direction": "long",
    "entryLow": number,
    "entryHigh": number,          // entry zone band around LTP
    "stopLoss": number,           // logical technical stop, below entry
    "target": number,             // first target, R:R >= ${MIN_RR}
    "target2": number,            // stretch target
    "confidence": number,         // 0-100
    "conviction": "high"|"medium"|"low",
    "technicalThesis": string,    // 2-3 sentences referencing the actual indicators/levels
    "fundamentalCatalyst": string,// 1-2 sentences on the real driver from today's themes
    "newsTrigger": string,        // 1 sentence linking to a specific theme/news item
    "risks": [string],            // 2-3 concrete risks
    "invalidation": string,       // what would kill the trade
    "timeHorizon": string,        // e.g. "Intraday, exit by 15:15 IST"
    "positionGuidance": string    // e.g. "Risk 0.5-0.75% of capital; size using stop distance"
  }
]

Rules:
- Use ONLY symbols from the candidate list. Match spelling exactly (including hyphens, e.g. "BAJAJ-AUTO").
- Numbers must be realistic INR price levels consistent with each stock's LTP.
- RISK DISCIPLINE IS MANDATORY: compute risk = midEntry - stopLoss and reward = target - midEntry.
  You MUST ensure reward >= ${MIN_RR} * risk. If your natural resistance gives a smaller reward, either widen the
  target to the next resistance level OR do not select that stock. Formula: target >= midEntry + ${MIN_RR}*(midEntry - stopLoss).
- target2 should be >= ${STRETCH_RR} * risk from midEntry (stretch target).
- Be honest: if the broad market is risk-off, pick defensive/relative-strength names and lower confidence.
- Output ONLY the JSON array.`;

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "You are a precise, disciplined intraday equity strategist. You output only valid JSON arrays.",
      },
      { role: "user", content: prompt },
    ],
    thinking: { type: "disabled" },
  });

  let raw: any[];
  try {
    raw = extractJson(completion.choices[0]?.message?.content || "[]");
    if (!Array.isArray(raw)) raw = [];
  } catch {
    raw = [];
  }

  return assemblePicks(raw, candidates);
}

/**
 * Validate, enrich and rank the strategist's raw output, backfilling from the
 * technical screen when it underdelivers. Pure — exported for testing.
 */
export function assemblePicks(raw: any[], candidates: CandidateSummary[]): StockPick[] {
  const candBySymbol = new Map(candidates.map((c) => [c.symbol, c]));
  const seen = new Set<string>();

  const picks: StockPick[] = [];
  for (const p of raw) {
    if (!p || typeof p.symbol !== "string") continue;
    const cand = candBySymbol.get(p.symbol);
    // Reject hallucinated tickers and duplicate rows rather than trusting the
    // model to have followed the "match a candidate exactly" instruction.
    if (!cand || seen.has(p.symbol)) continue;
    seen.add(p.symbol);
    picks.push(buildLlmPick(p, cand));
  }

  if (picks.length < PICK_COUNT) {
    const fillers = candidates
      .filter((c) => !seen.has(c.symbol))
      .sort((a, b) => b.bullishScore - a.bullishScore)
      .slice(0, PICK_COUNT - picks.length)
      .map((c) => buildBackfillPick(c));
    picks.push(...fillers);
  }

  return picks
    .sort((a, b) => b.confidence - a.confidence || b.riskReward - a.riskReward)
    .slice(0, PICK_COUNT)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

function buildLlmPick(p: any, cand: CandidateSummary): StockPick {
  const meta = STOCK_BY_SYMBOL[cand.symbol];
  const plan = buildTradePlan({
    ltp: cand.ltp,
    entryLow: p.entryLow,
    entryHigh: p.entryHigh,
    stopLoss: p.stopLoss,
    target: p.target,
    target2: p.target2,
    atrPct: cand.atrPct,
    swingLow: cand.swingLow,
  });

  return {
    rank: 0,
    symbol: cand.symbol,
    name: meta?.name ?? cand.name,
    sector: meta?.sector ?? cand.sector,
    direction: "long",
    ltp: cand.ltp,
    entryLow: plan.entryLow,
    entryHigh: plan.entryHigh,
    stopLoss: plan.stopLoss,
    target: plan.target,
    target2: plan.target2,
    riskReward: plan.riskReward,
    confidence: clampInt(Number(p.confidence), 0, 100, 60),
    conviction: (["high", "medium", "low"].includes(p.conviction)
      ? p.conviction
      : "medium") as StockPick["conviction"],
    indicators: pickIndicators(cand),
    technicalThesis: String(p.technicalThesis || ""),
    fundamentalCatalyst: String(p.fundamentalCatalyst || ""),
    newsTrigger: String(p.newsTrigger || ""),
    risks: Array.isArray(p.risks) ? p.risks.map(String).slice(0, 4) : [],
    invalidation: String(p.invalidation || ""),
    timeHorizon: String(p.timeHorizon || "Intraday, exit by 15:15 IST"),
    positionGuidance: String(
      p.positionGuidance || "Risk 0.5% of capital; size using stop distance.",
    ),
    origin: "llm",
    dataSource: "synthetic",
    signals: cand.signals,
  };
}

/**
 * Build a sound default pick from a candidate's technicals, used when the LLM
 * returns fewer than `PICK_COUNT` usable rows. Tagged `origin: "screen"` so the
 * UI can distinguish it from a reasoned pick.
 */
export function buildBackfillPick(c: CandidateSummary): StockPick {
  const meta = STOCK_BY_SYMBOL[c.symbol];
  const plan = buildTradePlan({
    ltp: c.ltp,
    atrPct: c.atrPct,
    swingLow: c.swingLow,
  });

  const conf = Math.max(50, Math.min(80, c.bullishScore));
  const conviction: StockPick["conviction"] = conf >= 70 ? "high" : conf >= 60 ? "medium" : "low";

  const trendWord =
    c.emaTrend === "up"
      ? "above a rising EMA stack"
      : c.emaTrend === "down"
        ? "with EMAs flattening"
        : "in a range";
  const macdWord = c.macdHist >= 0 ? "positive MACD histogram" : "negative but stabilising MACD";
  const volWord =
    c.volumeRatio >= 1.3 ? "with above-average volume confirmation" : "on normal volume";
  const adxWord =
    c.adx14 >= 25 ? `ADX ${c.adx14} confirms trend strength` : `ADX ${c.adx14} — trend still developing`;

  return {
    rank: 0,
    symbol: c.symbol,
    name: meta?.name ?? c.name,
    sector: c.sector,
    direction: "long",
    ltp: c.ltp,
    entryLow: plan.entryLow,
    entryHigh: plan.entryHigh,
    stopLoss: plan.stopLoss,
    target: plan.target,
    target2: plan.target2,
    riskReward: plan.riskReward,
    confidence: conf,
    conviction,
    indicators: pickIndicators(c),
    technicalThesis: `${c.symbol} is ${trendWord} (${c.setupLabel}). RSI ${c.rsi14}, ${macdWord}, ${volWord}. ${adxWord}. Entry planned on a small pullback into the ${inr0(plan.entryLow)}-${inr0(plan.entryHigh)} band with a stop below ${inr0(plan.stopLoss)}.`,
    fundamentalCatalyst: `Backfilled from the technical strength screen — aligned with today's ${c.sector.toLowerCase()} posture. No stock-specific news trigger was flagged by the strategist; verify catalysts on your terminal before trading.`,
    newsTrigger: `Sector: ${c.sector}. Review the pre-market intel for today's theme alignment.`,
    risks: [
      "No confirmed news catalyst — this trade is technical-driven only",
      "A market-wide risk-off move could invalidate the setup",
      `Stop at ${inr0(plan.stopLoss)} is technical (swing low / ATR) and can be hit by noise`,
    ],
    invalidation: `Intraday close below ${inr0(plan.stopLoss)} or a sharp deterioration in broader market sentiment`,
    timeHorizon: "Intraday, exit by 15:15 IST",
    positionGuidance:
      "Risk 0.5% of capital; size using the stop distance. Smaller size than strategist-conviction picks.",
    origin: "screen",
    dataSource: "synthetic",
    signals: c.signals,
  };
}

/** Stamp the actual data source onto a finished set of picks. Picks default to
 *  "synthetic" so an untagged pick under-claims rather than over-claims. */
export function tagDataSource(picks: StockPick[], source: DataSource): StockPick[] {
  return picks.map((p) => ({ ...p, dataSource: source }));
}

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  if (!isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function inr0(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
