import { z } from "zod";
import { db } from "@/lib/db";
import {
  buildCandidateSummaries,
  generatePicks,
  getPremarketIntel,
  PICK_COUNT,
  tagDataSource,
} from "@/lib/ai";
import { getISTDate } from "@/lib/market-status";
import { errorMessage, fail, ok, parseQuery } from "@/lib/api";
import type { DataSource, PicksPayload, PremarketIntel, StockPick } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const PICKS_TTL_MS = 45 * 60 * 1000;
const INTEL_TTL_MS = 30 * 60 * 1000;

const querySchema = z.object({
  force: z.enum(["0", "1"]).optional(),
});

export async function GET(req: Request) {
  const parsed = parseQuery(req, querySchema);
  if (!parsed.success) return parsed.response;
  const force = parsed.data.force === "1";
  const runDate = getISTDate();

  try {
    // A single read serves both the cache check and the intel-reuse check; the
    // previous version queried the same row twice.
    const existing = await db.analysisRun.findUnique({ where: { runDate } });

    if (!force && existing) {
      const age = Date.now() - existing.updatedAt.getTime();
      const picks = safeParse<StockPick[]>(existing.picksJson, []);
      if (picks.length === PICK_COUNT && age < PICKS_TTL_MS) {
        const payload: PicksPayload = {
          picks,
          intel: safeParse<PremarketIntel>(existing.premarketJson, {} as PremarketIntel),
          dataSource: (existing.dataSource as DataSource) ?? "synthetic",
        };
        return ok(payload, { cached: true });
      }
    }

    // Reuse a recent intel brief rather than re-running five web searches.
    const intelIsFresh =
      !force &&
      !!existing?.premarketJson &&
      existing.premarketJson !== "{}" &&
      Date.now() - existing.updatedAt.getTime() < INTEL_TTL_MS;

    const intel: PremarketIntel = intelIsFresh
      ? safeParse<PremarketIntel>(existing!.premarketJson, await getPremarketIntel())
      : await getPremarketIntel();

    const { candidates, dataSource } = await buildCandidateSummaries();
    if (candidates.length === 0) {
      return fail("No candidates could be evaluated — price history unavailable", 503);
    }

    const picks = tagDataSource(await generatePicks(intel, candidates), dataSource);

    await db.analysisRun.upsert({
      where: { runDate },
      create: {
        runDate,
        premarketJson: JSON.stringify(intel),
        picksJson: JSON.stringify(picks),
        marketStatus: "pre-open",
        dataSource,
      },
      update: {
        premarketJson: JSON.stringify(intel),
        picksJson: JSON.stringify(picks),
        dataSource,
        updatedAt: new Date(),
      },
    });

    const payload: PicksPayload = { picks, intel, dataSource };
    return ok(payload, { cached: false });
  } catch (e) {
    return fail(errorMessage(e, "Failed to generate picks"));
  }
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
