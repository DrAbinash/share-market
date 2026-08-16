// Client-facing re-export of the shared domain types.
//
// Dashboard components import from here rather than reaching into `@/lib/*`,
// which keeps server-only modules (Prisma, the AI SDK) out of the client
// import graph even by accident.

export type {
  Candle,
  DataSource,
  EconomicEvent,
  GlobalCue,
  JournalResponse,
  JournalStats,
  JournalTrade,
  MarketPhase,
  MarketStatus,
  NewsItem,
  PickIndicators,
  PicksPayload,
  PivotLevels,
  PremarketIntel,
  ScreenerResponse,
  ScreenerRow,
  SectorBreadth,
  SectorTilt,
  SignalContribution,
  StockDetail,
  StockMeta,
  StockPick,
  TechSummary,
  TradeOutcome,
  TradeStatus,
  TrackRecordResponse,
  TrackRecordRow,
  TrackRecordSummary,
  WatchlistEntry,
} from "@/lib/types";
