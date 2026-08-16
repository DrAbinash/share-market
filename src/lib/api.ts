// Shared helpers for route handlers: uniform JSON envelopes and zod-validated
// query parsing, so every endpoint fails the same way instead of each route
// inventing its own error shape.

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export interface ApiOk<T> {
  ok: true;
  data: T;
  cached?: boolean;
}

export interface ApiErr {
  ok: false;
  error: string;
  details?: unknown;
}

export function ok<T>(data: T, extra: { cached?: boolean } = {}): NextResponse {
  return NextResponse.json({ ok: true, data, ...extra } satisfies ApiOk<T>);
}

export function fail(error: string, status = 500, details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error, details } satisfies ApiErr, { status });
}

/** Turn a thrown value into a safe message. Prisma and fetch errors can carry
 *  connection strings, so only `Error.message` is surfaced. */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export type Parsed<T> = { success: true; data: T } | { success: false; response: NextResponse };

/** Validate `URL.searchParams` against a zod schema, returning either the typed
 *  value or a ready-to-return 400. */
export function parseQuery<T>(req: Request, schema: ZodType<T>): Parsed<T> {
  const { searchParams } = new URL(req.url);
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      response: fail("Invalid query parameters", 400, result.error.issues),
    };
  }
  return { success: true, data: result.data };
}

/** Validate a JSON request body against a zod schema. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { success: false, response: fail("Request body must be valid JSON", 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: fail("Invalid request body", 400, result.error.issues) };
  }
  return { success: true, data: result.data };
}
