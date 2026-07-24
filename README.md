# AlphaDesk — Pre-Market Intraday Strategist

An AI-assisted research dashboard for Indian equities (NSE/BSE). Before the
opening bell it gathers real market news and economics, computes a full
technical picture across a curated universe, and produces a ranked shortlist of
intraday long candidates — each with an entry band, stop, targets, risk-reward,
and the reasoning behind it.

> **Educational research tool, not investment advice.** Nothing here is a
> solicitation or a guarantee. Verify every level on your broker terminal before
> placing an order.

## Where the prices come from

This matters, so it is stated plainly everywhere in the UI.

AlphaDesk tries a live market-data provider first (Yahoo Finance daily
candles). When no provider is reachable — a locked-down network, a provider
outage, an offline demo — it falls back to a **deterministic price simulator**
so the analysis pipeline still works end to end.

Every API response carries a `source` field of `"live"` or `"synthetic"`, and
the UI renders a **Live data** / **Simulated prices** badge on each surface that
shows a price. A simulated series is never presented as a real quote.

Control it with `MARKET_DATA_PROVIDER`:

| Value       | Behaviour                                                      |
| ----------- | -------------------------------------------------------------- |
| `auto`      | Try live, fall back to the simulator silently (default)         |
| `live`      | Same, but the failure reason is surfaced in the response        |
| `synthetic` | Never touch the network; always use the simulator               |

A circuit breaker stops re-attempting an unreachable provider on every request.

## Features

**Dashboard (`/`)**
- Pre-market intelligence brief: global cues, scheduled economic events, FII/DII
  posture, sector tilts and a sentiment score, all grounded in live web search.
- Ranked intraday picks, each with entry / stop / targets, risk-reward, thesis,
  catalyst, concrete risks and an invalidation level.
- Picks are labelled **Strategist** (LLM-selected, with a news catalyst) or
  **Screen** (backfilled from the technical screen, no catalyst confirmed) — the
  two are never conflated.
- Market-internals strip: advance/decline, participation above EMA20/EMA50, how
  much of the universe is genuinely trending.
- Position-size calculator and a news feed.
- Track record of past picks resolved against actual candles, with win rate,
  expectancy in R, profit factor, max drawdown and CSV export.

**Screener (`/screener`)**
- The whole universe scored on the same weighted signal set that drives the
  picks — sortable, filterable by sector/setup/name, exportable to CSV.
- Sector rotation heatmap and market-breadth tiles.
- One-click watchlist toggle and a chart drill-down per name.

**Journal (`/journal`)**
- Paper trades taken from picks, sized from a rupee risk budget.
- Open positions marked to market; closed trades keep their realised exit.
- Win rate, expectancy, profit factor, best/worst trade and a realised equity
  curve.
- Watchlist with live technicals joined on read.

## Technical engine

Indicators are computed from scratch (no TA dependency) in `src/lib/indicators.ts`:

SMA · EMA · RSI (Wilder) · MACD · ATR (Wilder) · Bollinger Bands · Supertrend ·
ADX/DMI (Wilder) · slow Stochastic · OBV · rolling VWAP · floor-trader pivots.

The composite `bullishScore` is **explainable**: it is assembled from an explicit
list of weighted signals, each carrying the observation behind it, and the UI
renders the full breakdown ("Why this score?") rather than an opaque number.

## Getting started

```bash
npm install            # or: bun install
cp .env.example .env
npx prisma generate
npx prisma db push     # creates the SQLite database

npm run dev            # http://localhost:3000
```

### Scripts

| Command              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Development server                       |
| `npm run build`      | Production build (type-checked)          |
| `npm start`          | Serve the standalone production build    |
| `npm test`           | Unit test suite (`bun test`)             |
| `npm run typecheck`  | `tsc --noEmit`                           |
| `npm run lint`       | ESLint                                   |
| `npm run db:push`    | Sync the Prisma schema to SQLite         |

## API

| Endpoint                | Methods                  | Notes                                            |
| ----------------------- | ------------------------ | ------------------------------------------------ |
| `/api`                  | GET                      | Endpoint index + active data-provider mode       |
| `/api/health`           | GET                      | Liveness probe (dependency-free)                 |
| `/api/market-status`    | GET                      | NSE session phase in IST, holiday-aware          |
| `/api/premarket`        | GET                      | Intelligence brief · `?force=1`                  |
| `/api/picks`            | GET                      | Ranked picks · `?force=1`                        |
| `/api/screener`         | GET                      | Full screen · `?format=csv&sector=&minScore=&trend=` |
| `/api/stock/{symbol}`   | GET                      | Candles + full technical summary                 |
| `/api/news`             | GET                      | News search · `?q=&num=`                         |
| `/api/track-record`     | GET                      | Historical outcomes · `?range=&from=&to=&format=csv` |
| `/api/journal`          | GET/POST/PATCH/DELETE    | Paper trades                                     |
| `/api/watchlist`        | GET/POST/DELETE          | Watchlist                                        |

All query and body parameters are zod-validated; responses use a uniform
`{ ok, data }` / `{ ok: false, error }` envelope.

## Market calendar

`src/lib/market-status.ts` holds the NSE trading-holiday calendar. Most Indian
market holidays follow lunar calendars and cannot be computed — the exchange
publishes them annually by circular, so **refresh the table each December**.

A year missing from the table degrades to weekend-only detection rather than
asserting that every weekday is a trading day. The 2026 entries currently cover
the fixed-date national holidays only; the lunar-calendar dates are deliberately
omitted rather than guessed, and should be added once the circular is published.

## Testing

```bash
npm test
```

Covers the indicator maths (including regime and warm-up edge cases), trade-plan
risk enforcement, LLM-output validation and backfill, outcome resolution,
journal accounting, IST session/holiday logic, provider payload parsing and CSV
escaping.

## Deployment

See [DEPLOY-SYNOLOGY.md](./DEPLOY-SYNOLOGY.md) for the Docker / Synology
Container Manager setup. SQLite lives on a bind-mounted volume and survives
image rebuilds.

## Stack

Next.js 16 (App Router, standalone output) · React 19 · TypeScript · Tailwind 4 ·
shadcn/ui · Prisma + SQLite · `z-ai-web-dev-sdk` for web search and the LLM.
