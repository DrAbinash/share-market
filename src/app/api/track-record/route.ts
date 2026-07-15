import { NextResponse } from "next/server";
import { getTrackRecord } from "@/lib/track-record";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const range = (searchParams.get("range") as "1d" | "db" | "7d" | "1m" | "custom") || "7d";
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  try {
    const data = await getTrackRecord(range, from, to);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to build track record" },
      { status: 500 },
    );
  }
}
