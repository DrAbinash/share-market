import { getStock } from "@/lib/stocks";
import { getSeries } from "@/lib/market-data";
import { summarize, MIN_CANDLES } from "@/lib/indicators";
import { errorMessage, fail, ok } from "@/lib/api";
import type { StockDetail } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const meta = getStock(decodeURIComponent(symbol));
  if (!meta) {
    return fail(`Unknown symbol: ${symbol}`, 404);
  }

  try {
    const series = await getSeries(meta.symbol, 120);
    if (series.candles.length < MIN_CANDLES) {
      return fail(`Insufficient price history for ${meta.symbol}`, 503);
    }

    const detail: StockDetail = {
      meta,
      candles: series.candles,
      summary: summarize(series.candles),
      source: series.source,
      provider: series.provider,
    };
    return ok(detail);
  } catch (e) {
    return fail(errorMessage(e, `Failed to load ${meta.symbol}`));
  }
}
