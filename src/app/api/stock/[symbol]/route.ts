import { NextResponse } from "next/server";
import { getStock } from "@/lib/stocks";
import { generateCandles } from "@/lib/ohlc";
import { summarize } from "@/lib/indicators";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const meta = getStock(symbol);
  if (!meta) {
    return NextResponse.json({ ok: false, error: `Unknown symbol: ${symbol}` }, { status: 404 });
  }
  const candles = generateCandles(meta, 75);
  const summary = summarize(candles);
  return NextResponse.json({
    ok: true,
    data: {
      meta,
      candles,
      summary,
    },
  });
}
