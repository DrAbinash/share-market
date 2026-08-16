"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Eye,
  LineChart,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketHeader } from "@/components/dashboard/market-header";
import { SiteFooter } from "@/components/dashboard/site-footer";
import { EquityCurve } from "@/components/dashboard/equity-curve";
import { StockDetailSheet } from "@/components/dashboard/stock-detail-sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { inr, num, timeAgo } from "@/components/dashboard/format";
import type { JournalResponse, JournalTrade, WatchlistEntry } from "@/components/dashboard/types";

type Filter = "all" | "open" | "closed";

export default function JournalPage() {
  const { toast } = useToast();
  const [data, setData] = useState<JournalResponse | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jRes, wRes] = await Promise.all([fetch("/api/journal"), fetch("/api/watchlist")]);
      const j = await jRes.json();
      if (j.ok) setData(j.data);
      else setError(j.error || "Failed to load journal");

      const w = await wRes.json();
      if (w.ok) setWatchlist(w.data);
    } catch (e: any) {
      setError(e?.message || "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-mount; load() flips its own loading flag before awaiting the API
    load();
  }, [load]);

  const mutate = async (
    label: string,
    run: () => Promise<Response>,
    id: string,
  ) => {
    setBusyId(id);
    try {
      const r = await run();
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `${label} failed`);
      await load();
    } catch (e: any) {
      toast({ title: `${label} failed`, description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const closeTrade = (t: JournalTrade) =>
    mutate(
      "Close trade",
      () =>
        fetch("/api/journal", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: t.id, outcome: "manual" }),
        }),
      t.id,
    );

  const removeTrade = (t: JournalTrade) =>
    mutate(
      "Delete trade",
      () => fetch(`/api/journal?id=${encodeURIComponent(t.id)}`, { method: "DELETE" }),
      t.id,
    );

  const unwatch = async (symbol: string) => {
    try {
      const r = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      });
      const j = await r.json();
      if (j.ok) setWatchlist(j.data);
    } catch {
      /* non-critical */
    }
  };

  const trades = useMemo(() => {
    const all = data?.trades ?? [];
    if (filter === "all") return all;
    return all.filter((t) => t.status === filter);
  }, [data, filter]);

  const stats = data?.stats;

  return (
    <div className="min-h-screen flex flex-col grid-bg">
      <MarketHeader onRefresh={load} refreshing={loading} />

      <main className="flex-1 w-full mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gain" />
              Paper Trading Journal
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Positions you took from the pick list, marked to market and scored in R-multiples.
              No real orders are placed — this is a record-keeping tool.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Journal unavailable</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={load}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading && !data ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-[300px] w-full rounded-xl" />
          </div>
        ) : (
          <>
            {stats && <StatsRow stats={stats} />}

            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="space-y-5 min-w-0">
                {stats && (
                  <section className="rounded-2xl border border-border bg-card/30 p-4">
                    <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                      <LineChart className="h-4 w-4 text-gain" /> Realised Equity Curve
                    </h2>
                    <EquityCurve points={stats.equityCurve} />
                  </section>
                )}

                <section className="rounded-2xl border border-border bg-card/30 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="text-sm font-semibold">Trades</h2>
                    <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                      <TabsList className="h-8">
                        <TabsTrigger value="all" className="text-xs px-3">
                          All ({data?.trades.length ?? 0})
                        </TabsTrigger>
                        <TabsTrigger value="open" className="text-xs px-3">
                          Open ({stats?.openTrades ?? 0})
                        </TabsTrigger>
                        <TabsTrigger value="closed" className="text-xs px-3">
                          Closed ({stats?.closedTrades ?? 0})
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {trades.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center">
                      <BookOpen className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No trades recorded yet. Open a pick from the dashboard and use
                        “Add to paper journal”.
                      </p>
                    </div>
                  ) : (
                    <TradeTable
                      trades={trades}
                      busyId={busyId}
                      onClose={closeTrade}
                      onDelete={removeTrade}
                      onSelect={(s) => {
                        setActiveSymbol(s);
                        setSheetOpen(true);
                      }}
                    />
                  )}
                </section>
              </div>

              <aside className="space-y-5">
                <section className="rounded-2xl border border-border bg-card/30 p-4">
                  <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                    <Eye className="h-4 w-4 text-gain" /> Watchlist
                  </h2>
                  {watchlist.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nothing watched yet. Add names from the screener.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {watchlist.map((w) => (
                        <li
                          key={w.id}
                          className="rounded-lg border border-border bg-background/40 p-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              className="text-left min-w-0"
                              onClick={() => {
                                setActiveSymbol(w.symbol);
                                setSheetOpen(true);
                              }}
                            >
                              <div className="text-xs font-semibold hover:text-gain transition-colors">
                                {w.symbol}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {w.setupLabel}
                              </div>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <div className="text-right">
                                <div className="text-xs tnum">{inr(w.ltp, 0)}</div>
                                <div
                                  className={cn(
                                    "text-[10px] tnum",
                                    w.change1d >= 0 ? "text-gain" : "text-loss",
                                  )}
                                >
                                  {w.change1d >= 0 ? "+" : ""}
                                  {num(w.change1d, 2)}%
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => unwatch(w.symbol)}
                                aria-label={`Remove ${w.symbol} from watchlist`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
      <StockDetailSheet symbol={activeSymbol} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function StatsRow({ stats }: { stats: NonNullable<JournalResponse["stats"]> }) {
  const tiles = [
    {
      label: "Total P&L",
      value: inr(stats.totalPnl, 0),
      tone: stats.totalPnl >= 0 ? "text-gain" : "text-loss",
      sub: `${inr(stats.realizedPnl, 0)} realised · ${inr(stats.unrealizedPnl, 0)} open`,
    },
    {
      label: "Win rate",
      value: `${num(stats.winRate, 1)}%`,
      tone: stats.winRate >= 50 ? "text-gain" : "text-warn",
      sub: `${stats.wins}W / ${stats.losses}L of ${stats.closedTrades}`,
    },
    {
      label: "Expectancy",
      value: `${stats.avgR >= 0 ? "+" : ""}${num(stats.avgR, 2)}R`,
      tone: stats.avgR >= 0 ? "text-gain" : "text-loss",
      sub: `${num(stats.totalR, 2)}R cumulative`,
    },
    {
      label: "Profit factor",
      value: stats.profitFactor === 0 ? "—" : num(stats.profitFactor, 2),
      tone: stats.profitFactor >= 1.5 ? "text-gain" : "",
      sub: "gross profit ÷ gross loss",
    },
    {
      label: "Best trade",
      value: inr(stats.bestTrade, 0),
      tone: "text-gain",
      sub: `worst ${inr(stats.worstTrade, 0)}`,
    },
    {
      label: "Positions",
      value: `${stats.openTrades} open`,
      sub: `${stats.totalTrades} recorded`,
    },
  ];

  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
          <div className={cn("text-base font-bold tnum leading-tight mt-0.5", t.tone)}>{t.value}</div>
          <div className="text-[10px] text-muted-foreground tnum truncate" title={t.sub}>
            {t.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function TradeTable({
  trades,
  busyId,
  onClose,
  onDelete,
  onSelect,
}: {
  trades: JournalTrade[];
  busyId: string | null;
  onClose: (t: JournalTrade) => void;
  onDelete: (t: JournalTrade) => void;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[820px] text-xs">
        <thead className="bg-muted/50">
          <tr>
            {["Symbol", "Qty", "Entry", "Stop", "Target", "Mark", "P&L", "R", "Status", ""].map(
              (h, i) => (
                <th
                  key={h || i}
                  scope="col"
                  className={cn(
                    "px-2.5 py-2 font-medium text-muted-foreground whitespace-nowrap",
                    i === 0 || i === 8 ? "text-left" : i === 9 ? "text-right" : "text-right",
                  )}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-t border-border hover:bg-muted/30 transition-colors">
              <td className="px-2.5 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(t.symbol)}
                  className="text-left hover:text-gain transition-colors"
                >
                  <div className="font-semibold">{t.symbol}</div>
                  <div className="text-[10px] text-muted-foreground">{timeAgo(t.openedAt)}</div>
                </button>
              </td>
              <td className="px-2.5 py-2 text-right tnum">{t.quantity}</td>
              <td className="px-2.5 py-2 text-right tnum">{inr(t.entryPrice, 2)}</td>
              <td className="px-2.5 py-2 text-right tnum text-loss">{inr(t.stopLoss, 2)}</td>
              <td className="px-2.5 py-2 text-right tnum text-gain">{inr(t.target, 2)}</td>
              <td className="px-2.5 py-2 text-right tnum">{inr(t.lastPrice, 2)}</td>
              <td
                className={cn(
                  "px-2.5 py-2 text-right tnum font-medium",
                  t.pnl > 0 ? "text-gain" : t.pnl < 0 ? "text-loss" : "",
                )}
              >
                {inr(t.pnl, 0)}
              </td>
              <td
                className={cn(
                  "px-2.5 py-2 text-right tnum",
                  t.rMultiple > 0 ? "text-gain" : t.rMultiple < 0 ? "text-loss" : "",
                )}
              >
                {t.rMultiple >= 0 ? "+" : ""}
                {num(t.rMultiple, 2)}R
              </td>
              <td className="px-2.5 py-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] capitalize",
                    t.status === "open"
                      ? "border-warn/40 bg-warn/10 text-warn"
                      : t.realizedPnl >= 0
                        ? "border-gain/40 bg-gain/10 text-gain"
                        : "border-loss/40 bg-loss/10 text-loss",
                  )}
                >
                  {t.status === "open" ? "open" : t.outcome}
                </Badge>
              </td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap">
                {t.status === "open" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    disabled={busyId === t.id}
                    onClick={() => onClose(t)}
                  >
                    {busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Close"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={busyId === t.id}
                  onClick={() => onDelete(t)}
                  aria-label={`Delete ${t.symbol} trade`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
