// Pure accounting for the paper-trading journal.
//
// Kept separate from `journal.ts` because that module imports Prisma: the risk
// calculator and the "add to journal" popover both need `suggestQuantity` on
// the client, and pulling the DB client into a browser bundle to get it would
// be a mistake. Being dependency-free also makes this trivially unit-testable.

import type { JournalStats, JournalTrade, TradeOutcome } from "./types";

/** Row shape accepted by `toJournalTrade` — structurally the Prisma model. */
export interface PaperTradeRow {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
  quantity: number;
  status: string;
  outcome: string;
  exitPrice: number | null;
  notes: string;
  openedAt: Date;
  closedAt: Date | null;
}

/**
 * Position size that risks `riskAmount` given the stop distance.
 *
 * Rounds down, so the realised risk is never more than the budget.
 */
export function suggestQuantity(
  entryPrice: number,
  stopLoss: number,
  riskAmount: number,
): number {
  const perShare = entryPrice - stopLoss;
  if (!isFinite(perShare) || perShare <= 0 || riskAmount <= 0) return 0;
  return Math.max(0, Math.floor(riskAmount / perShare));
}

/** Shape a stored row plus a mark price into the client-facing trade record. */
export function toJournalTrade(row: PaperTradeRow, markPrice: number): JournalTrade {
  const closed = row.status === "closed";
  const exit = closed ? (row.exitPrice ?? row.entryPrice) : null;
  const lastPrice = closed ? (exit as number) : markPrice;

  // Risk is fixed at entry: a 1R loss is exactly the planned stop distance
  // times size, regardless of where price went afterwards.
  const perShareRisk = Math.max(0.01, row.entryPrice - row.stopLoss);
  const riskAmount = perShareRisk * row.quantity;
  const pnl = (lastPrice - row.entryPrice) * row.quantity;

  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    direction: "long",
    entryPrice: round2(row.entryPrice),
    stopLoss: round2(row.stopLoss),
    target: round2(row.target),
    quantity: row.quantity,
    status: closed ? "closed" : "open",
    outcome: (row.outcome as TradeOutcome) ?? "open",
    exitPrice: exit == null ? null : round2(exit),
    notes: row.notes,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    lastPrice: round2(lastPrice),
    unrealizedPnl: closed ? 0 : round2(pnl),
    realizedPnl: closed ? round2(pnl) : 0,
    pnl: round2(pnl),
    rMultiple: round2(pnl / riskAmount),
    riskAmount: round2(riskAmount),
  };
}

export function computeStats(trades: JournalTrade[]): JournalStats {
  const closed = trades.filter((t) => t.status === "closed");
  const open = trades.filter((t) => t.status === "open");

  const wins = closed.filter((t) => t.realizedPnl > 0);
  const losses = closed.filter((t) => t.realizedPnl < 0);

  const realizedPnl = sum(closed.map((t) => t.realizedPnl));
  const unrealizedPnl = sum(open.map((t) => t.unrealizedPnl));
  const totalR = sum(closed.map((t) => t.rMultiple));

  const grossProfit = sum(wins.map((t) => t.realizedPnl));
  const grossLoss = Math.abs(sum(losses.map((t) => t.realizedPnl)));

  // Equity is built from realised P&L only, so the curve does not move around
  // with open marks. Oldest-first, so it reads left to right.
  const chronological = [...closed].sort((a, b) =>
    (a.closedAt ?? a.openedAt).localeCompare(b.closedAt ?? b.openedAt),
  );
  let cumulative = 0;
  const equityCurve = chronological.map((t) => {
    cumulative += t.realizedPnl;
    return { date: (t.closedAt ?? t.openedAt).slice(0, 10), cumulative: round2(cumulative) };
  });

  return {
    totalTrades: trades.length,
    openTrades: open.length,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length === 0 ? 0 : round1((wins.length / closed.length) * 100),
    totalPnl: round2(realizedPnl + unrealizedPnl),
    realizedPnl: round2(realizedPnl),
    unrealizedPnl: round2(unrealizedPnl),
    avgR: closed.length === 0 ? 0 : round2(totalR / closed.length),
    totalR: round2(totalR),
    bestTrade: closed.length === 0 ? 0 : round2(Math.max(...closed.map((t) => t.realizedPnl))),
    worstTrade: closed.length === 0 ? 0 : round2(Math.min(...closed.map((t) => t.realizedPnl))),
    // An undefined profit factor (no losing trades yet) is reported as 0 rather
    // than Infinity, which does not survive JSON serialisation.
    profitFactor: grossLoss === 0 ? 0 : round2(grossProfit / grossLoss),
    equityCurve,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
