import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPremarketIntel, generatePicks, buildCandidateSummaries, StockPick, PremarketIntel } from "@/lib/ai";
import { getISTDate } from "@/lib/market-status";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const PICKS_TTL_MS = 45 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1";
  const runDate = getISTDate();

  try {
    // 1) Try cache first
    if (!force) {
      const cached = await db.analysisRun.findUnique({ where: { runDate } });
      if (cached) {
        const age = Date.now() - cached.updatedAt.getTime();
        let picks: StockPick[] = [];
        try {
          picks = JSON.parse(cached.picksJson || "[]");
        } catch {
          picks = [];
        }
        if (picks.length === 5 && age < PICKS_TTL_MS) {
          const intel: PremarketIntel = JSON.parse(cached.premarketJson || "{}");
          return NextResponse.json({ ok: true, cached: true, data: { picks, intel } });
        }
      }
    }

    // 2) Build fresh: need premarket intel + candidate technicals
    //    Pull intel from cache if fresh enough, else fetch.
    let intel: PremarketIntel;
    const existing = await db.analysisRun.findUnique({ where: { runDate } });
    if (
      existing &&
      existing.premarketJson &&
      existing.premarketJson !== "{}" &&
      Date.now() - existing.updatedAt.getTime() < 30 * 60 * 1000 &&
      !force
    ) {
      intel = JSON.parse(existing.premarketJson);
    } else {
      intel = await getPremarketIntel();
    }

    const candidates = buildCandidateSummaries();
    const picks = await generatePicks(intel, candidates);

    // 3) Persist
    await db.analysisRun.upsert({
      where: { runDate },
      create: {
        runDate,
        premarketJson: JSON.stringify(intel),
        picksJson: JSON.stringify(picks),
        marketStatus: "pre-open",
      },
      update: {
        premarketJson: JSON.stringify(intel),
        picksJson: JSON.stringify(picks),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, cached: false, data: { picks, intel } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to generate picks" },
      { status: 500 },
    );
  }
}
