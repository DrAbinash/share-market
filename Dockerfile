# AlphaDesk — Synology-ready Dockerfile
# Multi-stage build: Next.js standalone + Prisma (SQLite) + Bun-built deps.
# Designed for Synology Container Manager (works on amd64 + arm64 NAS models).

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Bun is used in dev; for a reproducible production build inside Docker we use
# npm with the committed package-lock.json (lockfile is generated from bun's
# resolved graph, so versions stay identical). This avoids needing to install
# bun in the image and keeps the build cross-arch clean.
COPY package.json bun.lock* package-lock.json* ./

# Generate a real package-lock.json from bun.lock if one isn't present, then ci-install.
RUN if [ ! -f package-lock.json ]; then npm install --package-lock-only; fi
RUN npm ci

# Copy Prisma schema and generate the client BEFORE copying the rest of the
# source. This ensures the correct engine binary for Alpine/musl is downloaded.
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the source and build the Next.js standalone output.
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner

# tini for proper PID-1 signal handling (clean shutdown), sqlite3 CLI optional
# for inspection, wget for the Docker healthcheck.
RUN apk add --no-cache tini sqlite

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV TZ=Asia/Kolkata
# Database lives on a mounted volume so it survives container rebuilds.
ENV DATABASE_URL=file:/app/data/db/alphadesk.db

# Copy the standalone server (Next.js bundles only what's needed).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma runtime: engine binary (musl/Alpine) + generated client.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Prisma schema + migration tooling so the entrypoint can run `prisma db push`.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Entrypoint: runs migrations, then starts the standalone server.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Persistent data directory (mounted as a volume in docker-compose).
RUN mkdir -p /app/data/db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
