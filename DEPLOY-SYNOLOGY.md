# Deploying AlphaDesk on Synology NAS

AlphaDesk ships as a self-contained Docker image (Next.js standalone + Prisma + SQLite). No external database or broker connection is required — everything runs in one container, and the SQLite database persists on a bind-mounted volume so it survives updates.

Tested against Synology DSM 7.2+ with Container Manager. Works on both **amd64** (x86 NAS) and **arm64** (e.g. DS223j, DS423+) models — the build is fully cross-arch.

---

## What's in the deployment bundle

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: Next.js standalone + Prisma engine for Alpine/musl |
| `docker-entrypoint.sh` | Runs `prisma db push` on every start (idempotent), then starts the server |
| `docker-compose.yml` | Synology Container Manager–compatible service definition |
| `.env.example` | Copy to `.env` and tweak the host port if needed |
| `.dockerignore` | Keeps the build context small (excludes node_modules, .next, logs, uploads) |
| `prisma/` | Schema — entrypoint pushes it to the mounted SQLite file |
| `src/`, `package.json`, `bun.lock`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `components.json` | App source & build config |

---

## Step 1 — Upload the project to your NAS

1. Enable **File Station** and **Container Manager** in Synology DSM (Package Center).
2. Create a project folder, e.g. `/volume1/docker/alphadesk/`.
3. Upload **all project files** there (everything except `node_modules`, `.next`, `upload/`, `download/`, `skills/`, `examples/`, `*.log` — the `.dockerignore` already excludes these). File Station upload or `scp`/`rsync` from your laptop both work.

Your folder should look like:

```
/volume1/docker/alphadesk/
├── Dockerfile
├── docker-entrypoint.sh
├── docker-compose.yml
├── .env.example          →  copy to .env
├── package.json
├── bun.lock
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── tailwind.config.ts
├── components.json
├── prisma/
│   └── schema.prisma
├── public/
│   ├── logo.svg
│   └── robots.txt
└── src/
    └── ... (full app source)
```

## Step 2 — Configure the host port (optional)

```bash
cd /volume1/docker/alphadesk
cp .env.example .env
# edit .env — change APP_PORT if 3080 is taken
```

The container always listens on port 3000 internally; `APP_PORT` only controls the host-side mapping.

## Step 3 — Build & launch via Container Manager

**Option A — GUI (recommended):**

1. Open **Container Manager** → **Project** → **Create**.
2. Set project name: `alphadesk`.
3. Path: `/volume1/docker/alphadesk`.
4. Select **Use docker-compose** → it auto-detects `docker-compose.yml`.
5. Click **Next** → **Done**. Container Manager builds the image and starts the container. First build takes ~3–6 minutes depending on NAS CPU.

**Option B — SSH (faster, gives build logs):**

```bash
sudo -i
cd /volume1/docker/alphadesk
docker compose up -d --build
# follow the build:
docker compose logs -f
```

## Step 4 — Open the dashboard

Wait for the healthcheck to turn green (Container Manager shows the container as "Healthy" — usually 30–60s after start). Then in any browser on your LAN:

```
http://<NAS-IP>:3080
```

e.g. `http://192.168.1.10:3080`.

The first time you open it, the pre-market analysis runs (~30–60s — it gathers live news/economics and reasons through 6 stock picks). Subsequent loads are instant from the on-disk cache.

---

## Updating to a new version

1. Replace the project files on the NAS with the new version (keep `./data/db/` untouched — that's your persisted analysis history).
2. In Container Manager → Project → `alphadesk` → **Stop** → **Build and Start**.
   Or via SSH: `docker compose up -d --build`.

The entrypoint re-runs `prisma db push` on every boot, so schema changes are applied automatically.

---

## Where the data lives

- **SQLite database:** `/volume1/docker/alphadesk/data/db/alphadesk.db` (bind-mounted as `/app/data/db` inside the container). Contains cached pre-market intel + picks per trading day. Safe to back up with Hyper Backup — just grab the whole `data/` folder.

---

## Troubleshooting

**Container stays "unhealthy" / won't start**
- Check logs: Container Manager → Container → `alphadesk` → **Details** → **Log** tab. Or `docker compose logs`.
- Most common cause: a stale `data/db/alphadesk.db` from an incompatible schema. Stop the container, rename `data/db/alphadesk.db` to `.bak`, and start again — the entrypoint recreates it.

**Build fails on `prisma generate`**
- Your NAS architecture may need a specific Prisma engine. The Dockerfile already pins `node:20-alpine` for both stages so the musl engine is correct. If you customised the base image, ensure both stages use the same one.

**Port 3080 already in use**
- Edit `.env` → `APP_PORT=3081` (or any free port) → `docker compose up -d`.

**Reverse proxy / HTTPS (optional)**
- Use Synology's built-in **Reverse Proxy** (Control Panel → Login Portal → Advanced → Reverse Proxy). Source: your domain + 443/TLS. Destination: `localhost:3080`. Enable WebSocket if you plan to add real-time features later.

**First analysis is slow**
- The first `/api/picks` call does 5 parallel web searches + 2 LLM calls (~35s). This is expected and cached for 45 minutes. Re-opening the dashboard is instant.

---

## Resource notes

| NAS class | Memory | Works? |
|---|---|---|
| j-series (1 GB RAM) | 512M limit | Borderline — increase to 768M in compose if OOM-killed |
| value/plus (2 GB+) | 512M limit | Comfortable |
| plus/play (4 GB+) | 512M limit | Plenty of headroom |

CPU: any Synology CPU handles the load. Build time is the only variable — ARM NAS models (DS223j etc.) build ~2× slower than Intel ones.

---

## What is NOT included (and why)

- **No live broker feed / real-time tick data.** AlphaDesk uses deterministic representative OHLC for chart illustration and real web-sourced news/economics for the actual analysis. Connecting a live NSE feed requires a licensed data vendor (e.g. NSE GoingQuant, GlobalDatafeeds) — out of scope for this educational tool.
- **No order placement.** This is a research/analysis dashboard. Verify all levels on your broker terminal before trading.

See the in-app footer disclaimer for the full risk notice.
