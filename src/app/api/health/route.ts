import { NextResponse } from "next/server";

// Lightweight health probe for Docker / Synology Container Manager healthchecks.
// Kept dependency-free so it never fails due to DB/AI transient issues.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      status: "healthy",
      service: "alphadesk",
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
