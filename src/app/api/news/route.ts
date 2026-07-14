import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "Indian stock market news today NSE BSE intraday";

  try {
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", { query: q, num: 12 });
    const items = (Array.isArray(results) ? results : []).map((r: any) => ({
      title: r.name || "",
      snippet: r.snippet || "",
      url: r.url || "",
      source: r.host_name || "",
      date: r.date,
    }));
    return NextResponse.json({ ok: true, data: items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "News search failed" }, { status: 500 });
  }
}
