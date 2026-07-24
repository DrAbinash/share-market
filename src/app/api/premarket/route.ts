import { z } from "zod";
import { db } from "@/lib/db";
import { getPremarketIntel } from "@/lib/ai";
import { getISTDate } from "@/lib/market-status";
import { errorMessage, fail, ok, parseQuery } from "@/lib/api";
import type { PremarketIntel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache TTL: 30 minutes. Pre-market intel goes stale fast but we avoid hammering search.
const TTL_MS = 30 * 60 * 1000;

const querySchema = z.object({
  force: z.enum(["0", "1"]).optional(),
});

export async function GET(req: Request) {
  const parsed = parseQuery(req, querySchema);
  if (!parsed.success) return parsed.response;
  const force = parsed.data.force === "1";
  const runDate = getISTDate();

  try {
    if (!force) {
      const cached = await db.analysisRun.findUnique({ where: { runDate } });
      if (cached && Date.now() - cached.updatedAt.getTime() < TTL_MS) {
        try {
          const premarket = JSON.parse(cached.premarketJson) as PremarketIntel;
          // A row created by the picks route before its intel landed holds
          // "{}" — fall through and fetch rather than rendering an empty brief.
          if (premarket && Object.keys(premarket).length > 0) {
            return ok(premarket, { cached: true });
          }
        } catch {
          /* corrupt cache — fetch fresh below */
        }
      }
    }

    const intel = await getPremarketIntel();

    await db.analysisRun.upsert({
      where: { runDate },
      create: {
        runDate,
        premarketJson: JSON.stringify(intel),
        picksJson: "[]",
        marketStatus: "pre-open",
      },
      update: { premarketJson: JSON.stringify(intel), updatedAt: new Date() },
    });

    return ok(intel, { cached: false });
  } catch (e) {
    return fail(errorMessage(e, "Failed to build pre-market intelligence"));
  }
}
