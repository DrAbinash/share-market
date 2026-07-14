import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPremarketIntel, PremarketIntel } from "@/lib/ai";
import { getISTDate } from "@/lib/market-status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache TTL: 30 minutes. Pre-market intel goes stale fast but we avoid hammering search.
const TTL_MS = 30 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1";
  const runDate = getISTDate();

  try {
    if (!force) {
      const cached = await db.analysisRun.findUnique({ where: { runDate } });
      if (cached) {
        const age = Date.now() - cached.updatedAt.getTime();
        if (age < TTL_MS) {
          const premarket: PremarketIntel = JSON.parse(cached.premarketJson);
          return NextResponse.json({ ok: true, cached: true, data: premarket });
        }
      }
    }

    const intel = await getPremarketIntel();

    // Upsert into DB
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

    return NextResponse.json({ ok: true, cached: false, data: intel });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to build pre-market intelligence" },
      { status: 500 },
    );
  }
}
