#!/bin/sh
set -e

echo "========================================="
echo "[entrypoint] MRI Report Manager starting..."
echo "[entrypoint] Node.js: $(node --version)"
echo "[entrypoint] Platform: $(uname -m)"
echo "========================================="

# Ensure data directories exist
mkdir -p /app/data/db /app/data/uploads/organized

# Database setup using sqlite3 CLI
DB_FILE="/app/data/db/mri_reports.db"
SQL_FILE="/app/schema.sql"

setup_db() {
  echo "[entrypoint] Setting up database tables..."
  if [ -f "$SQL_FILE" ]; then
    if sqlite3 "$DB_FILE" < "$SQL_FILE" 2>&1; then
      echo "[entrypoint] Database tables created/verified."
      return 0
    else
      echo "[entrypoint] WARNING: sqlite3 setup had issues."
      return 1
    fi
  else
    echo "[entrypoint] WARNING: schema.sql not found!"
    return 1
  fi
}

# Check if DB exists and has required tables
if [ -f "$DB_FILE" ]; then
  echo "[entrypoint] Existing database found."

  # Check for required tables
  MISSING_TABLES=""
  for TABLE in MriReport ReportTemplate FindingTemplate HospitalSettings; do
    if ! sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='$TABLE';" 2>/dev/null | grep -q "$TABLE"; then
      MISSING_TABLES="$MISSING_TABLES $TABLE"
    fi
  done

  if [ -n "$MISSING_TABLES" ]; then
    echo "[entrypoint] MISSING TABLES:$MISSING_TABLES"
    echo "[entrypoint] Recreating database from scratch..."
    rm -f "$DB_FILE"
    setup_db
  else
    echo "[entrypoint] All 4 tables found. Database looks good."
    # Still run schema.sql to add any new columns (IF NOT EXISTS is safe)
    setup_db
  fi
else
  echo "[entrypoint] No existing database. Creating new one..."
  setup_db
fi

# Verify Prisma engine exists
ENGINE_FILE=$(find /app/node_modules/.prisma -name "libquery_engine*" -type f 2>/dev/null | head -1)
if [ -n "$ENGINE_FILE" ]; then
  echo "[entrypoint] Prisma engine found: $(basename "$ENGINE_FILE")"
else
  echo "[entrypoint] WARNING: No Prisma engine binary found!"
fi

# Verify server.js exists
if [ -f "/app/server.js" ]; then
  echo "[entrypoint] server.js found."
else
  echo "[entrypoint] FATAL: server.js not found! Build may have failed."
  ls -la /app/ 2>/dev/null
  exit 1
fi

echo "[entrypoint] Starting application on port ${PORT:-3000}..."
echo "========================================="

exec "$@"