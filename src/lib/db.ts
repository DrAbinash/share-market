import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is useful in development but floods production logs (and
    // echoes parameter values into them), so keep production to warn/error.
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["query", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
