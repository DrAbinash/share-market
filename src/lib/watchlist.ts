// Watchlist: a small set of symbols the user wants to follow, joined against
// freshly computed technicals on every read so a saved row never goes stale.

import { db } from "./db";
import { getSeries } from "./market-data";
import { getStock } from "./stocks";
import { summarize, MIN_CANDLES } from "./indicators";
import type { WatchlistEntry } from "./types";

export class WatchlistError extends Error {}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const rows = await db.watchlistItem.findMany({ orderBy: { createdAt: "desc" } });

  const entries = await Promise.all(
    rows.map(async (row): Promise<WatchlistEntry | null> => {
      const meta = getStock(row.symbol);
      if (!meta) return null;

      const series = await getSeries(row.symbol, 120);
      const base = {
        id: row.id,
        symbol: row.symbol,
        name: meta.name,
        sector: meta.sector,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      };

      if (series.candles.length < MIN_CANDLES) {
        return { ...base, ltp: 0, change1d: 0, rsi14: 0, bullishScore: 0, setupLabel: "No data" };
      }
      const s = summarize(series.candles);
      return {
        ...base,
        ltp: round2(s.lastClose),
        change1d: round2(s.change1d),
        rsi14: round1(s.rsi14),
        bullishScore: s.bullishScore,
        setupLabel: s.setupLabel,
      };
    }),
  );

  return entries.filter((e): e is WatchlistEntry => e !== null);
}

export async function addToWatchlist(symbol: string, note = ""): Promise<void> {
  const meta = getStock(symbol);
  if (!meta) throw new WatchlistError(`Unknown symbol: ${symbol}`);
  // Re-adding a symbol updates its note instead of erroring on the unique index.
  await db.watchlistItem.upsert({
    where: { symbol: meta.symbol },
    create: { symbol: meta.symbol, note },
    update: { note },
  });
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  await db.watchlistItem.deleteMany({ where: { symbol } });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
