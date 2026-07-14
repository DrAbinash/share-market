#!/bin/sh
set -e

echo "========================================="
echo "[entrypoint] AlphaDesk starting..."
echo "[entrypoint] Node.js: $(node --version)"
echo "[entrypoint] Platform: $(uname -m)  TZ=${TZ:-unset}"
echo "========================================="

# Ensure the persistent data directory exists (mounted as a volume in compose).
mkdir -p /app/data/db

DB_DIR="/app/data/db"
DB_FILE="${DB_DIR}/alphadesk.db"

# DATABASE_URL is set in the Dockerfile, but allow runtime override.
export DATABASE_URL="${DATABASE_URL:-file:${DB_FILE}}"

echo "[entrypoint] DATABASE_URL=${DATABASE_URL}"

# Run Prisma migrations (idempotent — safe on every start, including upgrades).
echo "[entrypoint] Pushing Prisma schema to database..."
if npx prisma db push --skip-generate 2>&1; then
  echo "[entrypoint] Database schema is in sync."
else
  echo "[entrypoint] WARNING: prisma db push had issues. Continuing — app may retry on first request."
fi

# Verify the Prisma engine binary is present (must match Alpine/musl).
ENGINE_FILE=$(find /app/node_modules/.prisma -name "libquery_engine*" -type f 2>/dev/null | head -1)
if [ -n "$ENGINE_FILE" ]; then
  echo "[entrypoint] Prisma engine: $(basename "$ENGINE_FILE")"
else
  echo "[entrypoint] WARNING: No Prisma engine binary found — DB queries will fail."
fi

# Verify the standalone server exists.
if [ ! -f "/app/server.js" ]; then
  echo "[entrypoint] FATAL: server.js not found! Build may have failed."
  ls -la /app/ 2>/dev/null
  exit 1
fi
echo "[entrypoint] server.js found."

# Show DB file info (helps debugging on first run).
if [ -f "$DB_FILE" ]; then
  SIZE=$(stat -c %s "$DB_FILE" 2>/dev/null || stat -f %z "$DB_FILE" 2>/dev/null || echo "?")
  echo "[entrypoint] DB file: $DB_FILE (${SIZE} bytes)"
else
  echo "[entrypoint] DB file will be created on first write: $DB_FILE"
fi

echo "[entrypoint] Starting AlphaDesk on port ${PORT:-3000}..."
echo "========================================="

exec "$@"
