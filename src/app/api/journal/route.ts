import { z } from "zod";
import { closeTrade, deleteTrade, getJournal, JournalError, openTrade } from "@/lib/journal";
import { errorMessage, fail, ok, parseBody, parseQuery } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const openSchema = z.object({
  symbol: z.string().min(1),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  target: z.number().positive(),
  quantity: z.number().int().positive().max(1_000_000),
  notes: z.string().max(1000).optional(),
});

const closeSchema = z.object({
  id: z.string().min(1),
  exitPrice: z.number().positive().optional(),
  outcome: z.enum(["target", "sl", "manual"]).default("manual"),
});

const deleteSchema = z.object({ id: z.string().min(1) });

export async function GET() {
  try {
    return ok(await getJournal());
  } catch (e) {
    return fail(errorMessage(e, "Failed to load journal"));
  }
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, openSchema);
  if (!parsed.success) return parsed.response;

  try {
    return ok(await openTrade(parsed.data));
  } catch (e) {
    // A rejected trade plan is the caller's mistake, not a server fault.
    if (e instanceof JournalError) return fail(e.message, 400);
    return fail(errorMessage(e, "Failed to open trade"));
  }
}

export async function PATCH(req: Request) {
  const parsed = await parseBody(req, closeSchema);
  if (!parsed.success) return parsed.response;

  try {
    const { id, exitPrice, outcome } = parsed.data;
    return ok(await closeTrade(id, exitPrice, outcome));
  } catch (e) {
    if (e instanceof JournalError) return fail(e.message, 400);
    return fail(errorMessage(e, "Failed to close trade"));
  }
}

export async function DELETE(req: Request) {
  const parsed = parseQuery(req, deleteSchema);
  if (!parsed.success) return parsed.response;

  try {
    await deleteTrade(parsed.data.id);
    return ok({ deleted: parsed.data.id });
  } catch (e) {
    if (e instanceof JournalError) return fail(e.message, 404);
    return fail(errorMessage(e, "Failed to delete trade"));
  }
}
