import { z } from "zod";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  WatchlistError,
} from "@/lib/watchlist";
import { errorMessage, fail, ok, parseBody, parseQuery } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const addSchema = z.object({
  symbol: z.string().min(1).max(32),
  note: z.string().max(500).optional(),
});

const removeSchema = z.object({ symbol: z.string().min(1).max(32) });

export async function GET() {
  try {
    return ok(await getWatchlist());
  } catch (e) {
    return fail(errorMessage(e, "Failed to load watchlist"));
  }
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, addSchema);
  if (!parsed.success) return parsed.response;

  try {
    await addToWatchlist(parsed.data.symbol, parsed.data.note ?? "");
    return ok(await getWatchlist());
  } catch (e) {
    if (e instanceof WatchlistError) return fail(e.message, 400);
    return fail(errorMessage(e, "Failed to update watchlist"));
  }
}

export async function DELETE(req: Request) {
  const parsed = parseQuery(req, removeSchema);
  if (!parsed.success) return parsed.response;

  try {
    await removeFromWatchlist(parsed.data.symbol);
    return ok(await getWatchlist());
  } catch (e) {
    return fail(errorMessage(e, "Failed to update watchlist"));
  }
}
