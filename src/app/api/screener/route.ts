import { z } from "zod";
import { runScreener, screenerToCsv } from "@/lib/screener";
import { errorMessage, fail, ok, parseQuery } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  /** `csv` streams a download instead of JSON. */
  format: z.enum(["json", "csv"]).default("json"),
  sector: z.string().optional(),
  /** Only return rows at or above this composite score. */
  minScore: z.coerce.number().min(0).max(100).optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
});

export async function GET(req: Request) {
  const parsed = parseQuery(req, querySchema);
  if (!parsed.success) return parsed.response;
  const { format, sector, minScore, trend } = parsed.data;

  try {
    const result = await runScreener();

    let rows = result.rows;
    if (sector) rows = rows.filter((r) => r.sector === sector);
    if (minScore !== undefined) rows = rows.filter((r) => r.bullishScore >= minScore);
    if (trend) rows = rows.filter((r) => r.emaTrend === trend);

    if (format === "csv") {
      return new Response(screenerToCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="screener-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return ok({ ...result, rows });
  } catch (e) {
    return fail(errorMessage(e, "Failed to run screener"));
  }
}
