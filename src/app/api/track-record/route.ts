import { z } from "zod";
import { getTrackRecord, trackRecordToCsv } from "@/lib/track-record";
import { errorMessage, fail, ok, parseQuery } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  range: z.enum(["1d", "db", "7d", "1m", "custom"]).default("7d"),
  from: z.string().regex(ISO_DATE).optional(),
  to: z.string().regex(ISO_DATE).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(req: Request) {
  const parsed = parseQuery(req, querySchema);
  if (!parsed.success) return parsed.response;
  const { range, from, to, format } = parsed.data;

  try {
    const data = await getTrackRecord(range, from, to);

    if (format === "csv") {
      return new Response(trackRecordToCsv(data.rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="track-record-${data.summary.from}-to-${data.summary.to}.csv"`,
        },
      });
    }

    return ok(data);
  } catch (e) {
    return fail(errorMessage(e, "Failed to build track record"));
  }
}
