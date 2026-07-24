import { getMarketStatus, hasHolidayData } from "@/lib/market-status";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// Server-side view of the session phase. The header ticks client-side, but
// having this as an endpoint lets external schedulers (cron, uptime checks)
// decide whether a pre-market run is worth triggering.
export async function GET() {
  const status = getMarketStatus();
  return ok({
    ...status,
    // Surfaced so a caller can tell "not a holiday" from "we have no calendar
    // data for this year".
    holidayCalendarLoaded: hasHolidayData(status.dateIST),
  });
}
