import { ok } from "@/lib/api";
import { providerMode } from "@/lib/market-data";

export const dynamic = "force-dynamic";

// API index. Replaces the scaffold's "Hello, world!" placeholder with something
// that documents the surface and reports how market data is being sourced.
export async function GET() {
  return ok({
    service: "alphadesk",
    marketDataProvider: providerMode(),
    endpoints: [
      { path: "/api/health", method: "GET", description: "Liveness probe" },
      { path: "/api/market-status", method: "GET", description: "Current NSE session phase (IST)" },
      { path: "/api/premarket", method: "GET", description: "Pre-market intelligence brief", query: "force=1" },
      { path: "/api/picks", method: "GET", description: "Today's ranked intraday picks", query: "force=1" },
      { path: "/api/screener", method: "GET", description: "Full-universe technical screen", query: "format=csv|json, sector, minScore, trend" },
      { path: "/api/stock/{symbol}", method: "GET", description: "Candles + full technical summary for one symbol" },
      { path: "/api/news", method: "GET", description: "Market news search", query: "q, num" },
      { path: "/api/track-record", method: "GET", description: "Historical pick outcomes", query: "range, from, to, format=csv|json" },
      { path: "/api/journal", method: "GET|POST|PATCH|DELETE", description: "Paper-trading journal" },
      { path: "/api/watchlist", method: "GET|POST|DELETE", description: "Watchlist with live technicals" },
    ],
  });
}
