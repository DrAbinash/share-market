"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, RefreshCw, Table2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketHeader } from "@/components/dashboard/market-header";
import { SiteFooter } from "@/components/dashboard/site-footer";
import { BreadthStrip } from "@/components/dashboard/breadth-strip";
import { SectorHeatmap } from "@/components/dashboard/sector-heatmap";
import { ScreenerTable } from "@/components/dashboard/screener-table";
import { StockDetailSheet } from "@/components/dashboard/stock-detail-sheet";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import type { ScreenerResponse, WatchlistEntry } from "@/components/dashboard/types";

export default function ScreenerPage() {
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/screener");
      const j = await r.json();
      if (j.ok) setData(j.data);
      else setError(j.error || "Failed to run screener");
    } catch (e: any) {
      setError(e?.message || "Failed to run screener");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    try {
      const r = await fetch("/api/watchlist");
      const j = await r.json();
      if (j.ok) setWatched(new Set((j.data as WatchlistEntry[]).map((w) => w.symbol)));
    } catch {
      /* the watchlist is a convenience — a failure here must not block the screen */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-mount; load() flips its own loading flag before awaiting the API
    load();
    loadWatchlist();
  }, [load, loadWatchlist]);

  const toggleWatch = async (symbol: string) => {
    const isWatched = watched.has(symbol);
    try {
      const r = await fetch(
        isWatched ? `/api/watchlist?symbol=${encodeURIComponent(symbol)}` : "/api/watchlist",
        isWatched
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbol }),
            },
      );
      const j = await r.json();
      if (j.ok) setWatched(new Set((j.data as WatchlistEntry[]).map((w) => w.symbol)));
    } catch {
      /* ignore — the button simply stays as it was */
    }
  };

  const openChart = (symbol: string) => {
    setActiveSymbol(symbol);
    setSheetOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col grid-bg">
      <MarketHeader onRefresh={load} refreshing={loading} />

      <main className="flex-1 w-full mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Table2 className="h-5 w-5 text-gain" />
              Technical Screener
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Every name in the universe, scored on the same weighted signal set that drives the
              daily picks — sortable, filterable and exportable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DataSourceBadge source={data?.source} />
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              Refresh
            </Button>
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a href="/api/screener?format=csv" download>
                <Download className="h-3.5 w-3.5" />
                CSV
              </a>
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Screen failed</AlertTitle>
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-gain" />
              Computing technicals across the universe…
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-[420px] w-full rounded-xl" />
          </div>
        ) : data ? (
          <>
            <BreadthStrip breadth={data.breadth} />
            <SectorHeatmap sectors={data.sectors} />
            <section className="rounded-2xl border border-border bg-card/30 p-4">
              <ScreenerTable
                rows={data.rows}
                onSelect={openChart}
                onWatch={toggleWatch}
                watched={watched}
              />
            </section>
          </>
        ) : null}
      </main>

      <SiteFooter />
      <StockDetailSheet symbol={activeSymbol} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
