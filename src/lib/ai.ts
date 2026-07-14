// AI layer: uses z-ai-web-dev-sdk (backend only).
// 1) getPremarketIntel(): parallel web searches for real market news/economics,
//    then an LLM digests them into a structured pre-market brief.
// 2) generatePicks(intel, candidateSummaries): the strategist LLM picks 6
//    intraday candidates with full reasoning, grounded in the real news brief
//    AND the computed technical summary for each candidate. If the LLM
//    underdelivers, the next-best technical candidates are backfilled so the
//    dashboard always shows exactly 6 picks.

import ZAI from "z-ai-web-dev-sdk";
import { STOCK_UNIVERSE, STOCK_BY_SYMBOL } from "./stocks";
import { generateCandles } from "./ohlc";
import { summarize, Candle } from "./indicators";

// ---------- Types ----------

export interface NewsItem {
  title: string;
  snippet: string;
  url: string;
  source: string;
  date?: string;
}

export interface GlobalCue {
  name: string;
  change: string; // e.g. "+0.8%"
  note: string;
}

export interface EconomicEvent {
  time: string;
  event: string;
  impact: "high" | "medium" | "low";
  forecast?: string;
}

export interface SectorTilt {
  sector: string;
  bias: "bullish" | "bearish" | "neutral";
  reason: string;
}

export interface PremarketIntel {
  asOf: string;
  globalCues: GlobalCue[];
  economicEvents: EconomicEvent[];
  fiidii: string; // narrative
  newsDigest: NewsItem[];
  keyThemes: string[];
  sectorTilts: SectorTilt[];
  sentiment: "Risk-On" | "Cautious" | "Risk-Off" | "Mixed";
  sentimentScore: number; // -100..100
  summary: string; // 2-3 sentence narrative
}

export interface PickIndicators {
  rsi14: number;
  ema20: number;
  ema50: number;
  macdHist: number;
  atrPct: number;
  volumeRatio: number;
  swingHigh: number;
  swingLow: number;
  setupLabel: string;
}

export interface StockPick {
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  direction: "long";
  ltp: number;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target: number;
  target2?: number; // stretch target
  riskReward: number;
  confidence: number; // 0-100
  conviction: "high" | "medium" | "low";
  indicators: PickIndicators;
  technicalThesis: string;
  fundamentalCatalyst: string;
  newsTrigger: string;
  risks: string[];
  invalidation: string;
  timeHorizon: string;
  positionGuidance: string;
}

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
  } catch (e) {
    return [];
  }
}

function extractJson(text: string): any {
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

  const allNews = [...indianMkt, ...sectorNews, ...globalCues, ...fiidii].slice(0, 16);

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
}

export function buildCandidateSummaries(): CandidateSummary[] {
  return STOCK_UNIVERSE.map((meta) => {
    const candles: Candle[] = generateCandles(meta, 75);
    const s = summarize(candles);
    return {
      symbol: meta.symbol,
      name: meta.name,
      sector: meta.sector,
      ltp: s.lastClose,
      change5d: s.change5d,
      change20d: s.change20d,
      rsi14: Math.round(s.rsi14 * 10) / 10,
      ema20: Math.round(s.ema20 * 100) / 100,
      ema50: Math.round(s.ema50 * 100) / 100,
      emaTrend: s.emaTrend,
      macdHist: Math.round(s.macdHist * 100) / 100,
      atrPct: Math.round(s.atrPct * 100) / 100,
      volumeRatio: Math.round(s.volumeRatio * 100) / 100,
      swingHigh: Math.round(s.swingHigh * 100) / 100,
      swingLow: Math.round(s.swingLow * 100) / 100,
      setupLabel: s.setupLabel,
      bullishScore: s.bullishScore,
    };
  });
}

// ---------- Picker ----------

export async function generatePicks(
  intel: PremarketIntel,
  candidates: CandidateSummary[],
): Promise<StockPick[]> {
  const zai = await ZAI.create();

  const candidateLines = candidates
    .map(
      (c) =>
        `${c.symbol} | ${c.name} | ${c.sector} | LTP ${c.ltp} | 5d ${c.change5d.toFixed(1)}% | 20d ${c.change20d.toFixed(1)}% | RSI ${c.rsi14} | EMA20 ${c.ema20} | EMA50 ${c.ema50} | trend ${c.emaTrend} | MACDhist ${c.macdHist} | ATR ${c.atrPct}% | volRatio ${c.volumeRatio} | swingHigh ${c.swingHigh} | swingLow ${c.swingLow} | setup: ${c.setupLabel} | bullScore ${c.bullishScore}`,
    )
    .join("\n");

  const prompt = `You are a disciplined intraday strategist for the Indian NSE. The market opens shortly.
Today's pre-market intelligence (real news + economics, just gathered):

SENTIMENT: ${intel.sentiment} (score ${intel.sentimentScore}/100)
SUMMARY: ${intel.summary}
KEY THEMES: ${intel.keyThemes.join(" | ")}
SECTOR TILTS: ${intel.sectorTilts.map((s) => `${s.sector}:${s.bias}`).join(" | ")}
FII/DII: ${intel.fiidii}

CANDIDATE UNIVERSE (large/liquid NSE names with computed technicals from recent daily charts):
${candidateLines}

TASK: Select exactly 5 stocks for INTRADAY LONG trades today that have a SOUND, NON-SPECULATIVE foundation.
Selection criteria (in priority order):
1. Technical alignment: prefer setups like volume-backed breakouts, uptrend continuation (EMA stack + MACD), or oversold reversal with confirmation. Avoid downtrends and dead ranges.
2. News/fundamental trigger: each pick must have a real catalyst from today's themes/sector tilts (earnings, policy, flows, global commodity move, sector rotation). Reject picks with no discernible driver.
3. Risk discipline: stop loss must be on a logical technical level (below swing low / EMA / ATR-based), target must give R:R >= 1.8.
4. Liquidity: only use the provided universe (all are liquid).
5. Diversification: spread across at least 5 different sectors; avoid 2 picks in the same sector unless exceptional.

Return STRICT JSON only — an array of exactly 6 objects with this schema:
[
  {
    "symbol": string,             // must match a candidate symbol exactly
    "direction": "long",
    "entryLow": number,
    "entryHigh": number,          // entry zone band around LTP
    "stopLoss": number,           // logical technical stop, below entry
    "target": number,             // first target, R:R >= 1.8
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
  You MUST ensure reward >= 1.8 * risk. If your natural resistance gives a smaller reward, either widen the
  target to the next resistance level OR do not select that stock. Formula: target >= midEntry + 1.8*(midEntry - stopLoss).
- target2 should be >= 2.5 * risk from midEntry (stretch target).
- Be honest: if the broad market is risk-off, pick defensive/relative-strength names and lower confidence.
- Output ONLY the JSON array.`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: "You are a precise, disciplined intraday equity strategist. You output only valid JSON arrays." },
      { role: "user", content: prompt },
    ],
    thinking: { type: "disabled" },
  });

  let raw: any[];
  try {
    const content = completion.choices[0]?.message?.content || "[]";
    raw = extractJson(content);
    if (!Array.isArray(raw)) raw = [];
  } catch {
    raw = [];
  }

  // Enrich + validate + compute R:R + fill meta from universe
  const bySymbol = new Map(STOCK_UNIVERSE.map((s) => [s.symbol, s]));
  const candBySymbol = new Map(candidates.map((c) => [c.symbol, c]));

  const enrichLLM = (p: any): StockPick | null => {
    if (!p || typeof p.symbol !== "string" || !bySymbol.has(p.symbol)) return null;
    const meta = bySymbol.get(p.symbol)!;
    const cand = candBySymbol.get(p.symbol)!;
    const entryLow = round2(Number(p.entryLow) || cand.ltp * 0.998);
    const entryHigh = round2(Number(p.entryHigh) || cand.ltp * 1.002);
    const entryMid = (entryLow + entryHigh) / 2;
    const stop = round2(Number(p.stopLoss) || cand.swingLow);
    const stopDist = Math.max(0.01, entryMid - stop);

    // Risk-discipline floor: enforce reward >= 1.8 * risk and stretch >= 2.5 * risk.
    let target = round2(Number(p.target) || entryMid + stopDist * 1.8);
    if (target - entryMid < 1.8 * stopDist) target = round2(entryMid + 1.8 * stopDist);
    let target2 = p.target2 ? round2(Number(p.target2)) : round2(entryMid + 2.6 * stopDist);
    if (target2 - entryMid < 2.5 * stopDist) target2 = round2(entryMid + 2.6 * stopDist);
    if (target2 <= target) target2 = round2(entryMid + 2.6 * stopDist);

    const rr = (target - entryMid) / stopDist;
    return {
      rank: 0,
      symbol: p.symbol,
      name: meta.name,
      sector: meta.sector,
      direction: "long" as const,
      ltp: cand.ltp,
      entryLow,
      entryHigh,
      stopLoss: stop,
      target,
      target2,
      riskReward: Math.round(rr * 100) / 100,
      confidence: Math.max(0, Math.min(100, Math.round(Number(p.confidence) || 60))),
      conviction: (["high", "medium", "low"].includes(p.conviction) ? p.conviction : "medium") as "high" | "medium" | "low",
      indicators: {
        rsi14: cand.rsi14,
        ema20: cand.ema20,
        ema50: cand.ema50,
        macdHist: cand.macdHist,
        atrPct: cand.atrPct,
        volumeRatio: cand.volumeRatio,
        swingHigh: cand.swingHigh,
        swingLow: cand.swingLow,
        setupLabel: cand.setupLabel,
      },
      technicalThesis: String(p.technicalThesis || ""),
      fundamentalCatalyst: String(p.fundamentalCatalyst || ""),
      newsTrigger: String(p.newsTrigger || ""),
      risks: Array.isArray(p.risks) ? p.risks.map(String).slice(0, 4) : [],
      invalidation: String(p.invalidation || ""),
      timeHorizon: String(p.timeHorizon || "Intraday, exit by 15:15 IST"),
      positionGuidance: String(p.positionGuidance || "Risk 0.5% of capital; size using stop distance."),
    };
  };

  let picks: StockPick[] = raw
    .map(enrichLLM)
    .filter((p: StockPick | null): p is StockPick => p !== null);

  // BACKFILL: if the LLM underdelivered (< 6 picks), top up from the next-best
  // technical candidates by bullish score. This guarantees the dashboard always
  // shows exactly 6 cards. Backfilled picks get a sensible default trade plan
  // computed from the technicals + an auto-generated narrative.
  const pickedSymbols = new Set(picks.map((p) => p.symbol));
  if (picks.length < 6) {
    const fillers = candidates
      .filter((c) => !pickedSymbols.has(c.symbol))
      .sort((a, b) => b.bullishScore - a.bullishScore)
      .slice(0, 6 - picks.length)
      .map((c) => buildBackfillPick(c));
    picks = picks.concat(fillers);
  }

  // Re-sort by confidence desc, keep top 6, re-rank
  const ranked = picks
    .sort((a, b) => b.confidence - a.confidence || b.riskReward - a.riskReward)
    .slice(0, 6)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return ranked;
}

// Build a sound default pick from a candidate's technicals (used when backfilling
// slots the LLM didn't fill). Trade plan is computed deterministically: entry band
// around LTP, stop below swing low (or ATR-based if too tight), target at 1.8R,
// stretch at 2.6R. Narrative is generated from the actual indicator values.
function buildBackfillPick(c: CandidateSummary): StockPick {
  const meta = STOCK_BY_SYMBOL[c.symbol];
  const entryLow = round2(c.ltp * 0.998);
  const entryHigh = round2(c.ltp * 1.002);
  const entryMid = (entryLow + entryHigh) / 2;
  // Stop: below swing low, but at least 1 ATR% away to avoid getting stopped on noise.
  const atrStop = entryMid * (c.atrPct / 100);
  let stop = Math.min(c.swingLow, entryMid - atrStop);
  // Ensure stop is sensibly below entry (min 0.4%)
  if (entryMid - stop < entryMid * 0.004) stop = round2(entryMid * 0.996);
  stop = round2(stop);
  const stopDist = Math.max(0.01, entryMid - stop);
  const target = round2(entryMid + 1.8 * stopDist);
  const target2 = round2(entryMid + 2.6 * stopDist);
  const rr = (target - entryMid) / stopDist;

  const conf = Math.max(50, Math.min(80, c.bullishScore));
  const conviction: "high" | "medium" | "low" = conf >= 70 ? "high" : conf >= 60 ? "medium" : "low";

  const trendWord = c.emaTrend === "up" ? "above a rising EMA stack" : c.emaTrend === "down" ? "with EMAs flattening" : "in a range";
  const macdWord = c.macdHist >= 0 ? "positive MACD histogram" : "negative but stabilising MACD";
  const rsiWord = c.rsi14 >= 60 ? "firm momentum (RSI in strength zone)" : c.rsi14 >= 50 ? "neutral-positive RSI" : "RSI cooling off from oversold";
  const volWord = c.volumeRatio >= 1.3 ? "with above-average volume confirmation" : "on normal volume";

  return {
    rank: 0,
    symbol: c.symbol,
    name: meta.name,
    sector: c.sector,
    direction: "long",
    ltp: c.ltp,
    entryLow,
    entryHigh,
    stopLoss: stop,
    target,
    target2,
    riskReward: Math.round(rr * 100) / 100,
    confidence: conf,
    conviction,
    indicators: {
      rsi14: c.rsi14,
      ema20: c.ema20,
      ema50: c.ema50,
      macdHist: c.macdHist,
      atrPct: c.atrPct,
      volumeRatio: c.volumeRatio,
      swingHigh: c.swingHigh,
      swingLow: c.swingLow,
      setupLabel: c.setupLabel,
    },
    technicalThesis: `${c.symbol} is ${trendWord} (${c.setupLabel}). RSI ${c.rsi14}, ${macdWord}, ${volWord}. Entry planned on a small pullback into the ${inr2(entryLow)}-${inr2(entryHigh)} band with a stop below ${inr2(stop)}.`,
    fundamentalCatalyst: `Backfilled from technical strength screen — aligned with today's ${c.sector.toLowerCase()} posture. No stock-specific news trigger flagged by the LLM; verify catalysts on your terminal before trading.`,
    newsTrigger: `Sector: ${c.sector}. Review pre-market intel for today's theme alignment.`,
    risks: [
      `No confirmed LLM-flagged news catalyst — trade is technical-driven only`,
      `Market-wide risk-off move could invalidate the setup`,
      `Stop at ${inr2(stop)} is technical (swing low / ATR) and can be hit by noise`,
    ],
    invalidation: `Intraday close below ${inr2(stop)} or a sharp deterioration in broader market sentiment`,
    timeHorizon: "Intraday, exit by 15:15 IST",
    positionGuidance: "Risk 0.5% of capital; size using the stop distance. Smaller size than LLM-conviction picks.",
  };
}

function inr2(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
