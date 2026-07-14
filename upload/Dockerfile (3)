# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies — npm ci uses package-lock.json for exact versions
# This is critical for Synology: ensures reproducible builds on any architecture
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema and generate client BEFORE copying source
# This ensures the correct engine binary for Alpine/musl is downloaded
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source and build
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build Next.js standalone output
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install sqlite3 CLI for runtime DB table creation
RUN apk add --no-cache sqlite

# Copy built standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma runtime files — engine binary + generated client
# The engine binary is platform-specific and MUST match the target architecture
# Since both stages use node:20-alpine, the binary is correct
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy SQL schema for entrypoint DB setup
COPY schema.sql /app/schema.sql

# Create data directories
RUN mkdir -p /app/data/uploads/organized /app/data/db

# Copy and set up entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/app/data/db/mri_reports.db"
ENV UPLOAD_DIR="/app/data/uploads"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]