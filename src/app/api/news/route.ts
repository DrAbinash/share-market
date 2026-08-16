import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { errorMessage, fail, ok, parseQuery } from "@/lib/api";
import type { NewsItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const DEFAULT_QUERY = "Indian stock market news today NSE BSE intraday";

const querySchema = z.object({
  // Bounded so the query cannot be used to smuggle an arbitrarily long prompt
  // into the upstream search call.
  q: z.string().min(2).max(200).default(DEFAULT_QUERY),
  num: z.coerce.number().int().min(1).max(20).default(12),
});

export async function GET(req: Request) {
  const parsed = parseQuery(req, querySchema);
  if (!parsed.success) return parsed.response;
  const { q, num } = parsed.data;

  try {
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", { query: q, num });
    const items: NewsItem[] = (Array.isArray(results) ? results : []).map((r: any) => ({
      title: r.name || "",
      snippet: r.snippet || "",
      url: r.url || "",
      source: r.host_name || "",
      date: r.date,
    }));
    return ok(items);
  } catch (e) {
    return fail(errorMessage(e, "News search failed"));
  }
}
