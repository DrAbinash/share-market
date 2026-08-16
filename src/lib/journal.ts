// Paper-trading journal — persistence and mark-to-market.
//
// The dashboard could tell you what to trade but had nowhere to record what you
// actually did. This tracks positions taken from picks (or entered by hand),
// marks open ones to market against the latest close, and derives the stats a
// trader actually reviews: win rate, expectancy in R, profit factor and an
// equity curve.
//
// The arithmetic lives in `journal-math.ts` so it stays free of the Prisma
// import and can be shared with the client.

import { db } from "./db";
import { getSeries } from "./market-data";
import { getStock } from "./stocks";
import { computeStats, toJournalTrade } from "./journal-math";
import type { JournalResponse, JournalTrade, TradeOutcome } from "./types";

export { computeStats, suggestQuantity, toJournalTrade } from "./journal-math";

export interface OpenTradeInput {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
  quantity: number;
  notes?: string;
}

/** Thrown for caller mistakes (bad symbol, invalid trade plan) so route
 *  handlers can answer 400 rather than 500. */
export class JournalError extends Error {}

/** Latest close for a symbol, used to mark open positions to market. */
async function latestClose(symbol: string): Promise<number | null> {
  const series = await getSeries(symbol, 120);
  const last = series.candles.at(-1);
  return last ? last.close : null;
}

export async function openTrade(input: OpenTradeInput): Promise<JournalTrade> {
  const meta = getStock(input.symbol);
  if (!meta) throw new JournalError(`Unknown symbol: ${input.symbol}`);
  if (input.stopLoss >= input.entryPrice) {
    throw new JournalError("Stop loss must be below the entry price for a long trade");
  }
  if (input.target <= input.entryPrice) {
    throw new JournalError("Target must be above the entry price for a long trade");
  }

  const row = await db.paperTrade.create({
    data: {
      symbol: meta.symbol,
      name: meta.name,
      sector: meta.sector,
      direction: "long",
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss,
      target: input.target,
      quantity: input.quantity,
      notes: input.notes ?? "",
    },
  });

  const mark = (await latestClose(meta.symbol)) ?? input.entryPrice;
  return toJournalTrade(row, mark);
}

export async function closeTrade(
  id: string,
  exitPrice?: number,
  outcome: TradeOutcome = "manual",
): Promise<JournalTrade> {
  const existing = await db.paperTrade.findUnique({ where: { id } });
  if (!existing) throw new JournalError(`No trade with id ${id}`);
  if (existing.status === "closed") throw new JournalError("Trade is already closed");

  // Closing without an explicit price exits at the latest mark.
  const exit = exitPrice ?? (await latestClose(existing.symbol)) ?? existing.entryPrice;

  const row = await db.paperTrade.update({
    where: { id },
    data: { status: "closed", outcome, exitPrice: exit, closedAt: new Date() },
  });
  return toJournalTrade(row, exit);
}

export async function deleteTrade(id: string): Promise<void> {
  const existing = await db.paperTrade.findUnique({ where: { id } });
  if (!existing) throw new JournalError(`No trade with id ${id}`);
  await db.paperTrade.delete({ where: { id } });
}

export async function getJournal(): Promise<JournalResponse> {
  const rows = await db.paperTrade.findMany({ orderBy: { openedAt: "desc" } });

  // Mark open positions to market — one series fetch per distinct symbol, not
  // one per row.
  const openSymbols = [...new Set(rows.filter((r) => r.status === "open").map((r) => r.symbol))];
  const marks = new Map<string, number>();
  await Promise.all(
    openSymbols.map(async (s) => {
      const close = await latestClose(s);
      if (close != null) marks.set(s, close);
    }),
  );

  const trades = rows.map((r) =>
    toJournalTrade(
      r,
      r.status === "closed"
        ? (r.exitPrice ?? r.entryPrice)
        : (marks.get(r.symbol) ?? r.entryPrice),
    ),
  );

  return { trades, stats: computeStats(trades) };
}
