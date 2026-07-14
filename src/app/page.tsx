"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle, ListChecks, Sparkles, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MarketHeader } from "@/components/dashboard/market-header";
import { SentimentHero } from "@/components/dashboard/sentiment-hero";
import { PremarketIntel } from "@/components/dashboard/premarket-intel";
import { PickCard } from "@/components/dashboard/pick-card";
import { StockDetailSheet } from "@/components/dashboard/stock-detail-sheet";
import { NewsFeed } from "@/components/dashboard/news-feed";
import { RiskCalculator } from "@/components/dashboard/risk-calculator";
import { SiteFooter } from "@/components/dashboard/site-footer";
import type { PremarketIntel, StockPick } from "@/components/dashboard/types";

export default function Page() {
  const [picks, setPicks] = useState<StockPick[]>([]);
  const [intel, setIntel] = useState<PremarketIntel | null>(null);
  const [picksLoading, setPicksLoading] = useState(true);
  const [intelLoading, setIntelLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>();
  const [activePick, setActivePick] = useState<StockPick | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchAll = useCallback(async (force: boolean) => {
    if (force) setRefreshing(true);
    setError(null);

    // Pre-market intel (faster) — fills the top of the page first
    const intelPromise = (async () => {
      setIntelLoading(true);
      try {
        const r = await fetch(`/api/premarket${force ? "?force=1" : ""}`);
        const j = await r.json();
        if (j.ok && j.data) {
          setIntel(j.data);
          setCached(!!j.cached);
        } else if (j.error) {
          setError(j.error);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load pre-market intelligence");
      } finally {
        setIntelLoading(false);
      }
    })();

    // Picks (slower — depends on intel + LLM strategist)
    const picksPromise = (async () => {
      setPicksLoading(true);
      try {
        const r = await fetch(`/api/picks${force ? "?force=1" : ""}`);
        const j = await r.json();
        if (j.ok && j.data) {
          setPicks(j.data.picks || []);
          if (j.data.intel) setIntel(j.data.intel);
          setCached(!!j.cached);
        } else if (j.error) {
          setError(j.error);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to generate picks");
      } finally {
        setPicksLoading(false);
        setLastUpdated(
          new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Calcutta", hour12: false }) + " IST",
        );
      }
    })();

    await Promise.all([intelPromise, picksPromise]);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  const handleAnalyze = (symbol: string) => {
    const p = picks.find((x) => x.symbol === symbol) || null;
    setActivePick(p);
    setSheetOpen(true);
  };

  const avgConfidence =
    picks.length > 0 ? Math.round(picks.reduce((a, b) => a + b.confidence, 0) / picks.length) : 0;

  return (
    <div className="min-h-screen flex flex-col grid-bg">
      <MarketHeader onRefresh={() => fetchAll(true)} refreshing={refreshing} lastUpdated={lastUpdated} />

      <main className="flex-1 w-full mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-5">
        {/* Intro strip */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gain" />
              Today's Strategic Intraday Brief
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              AI studies economics, charts &amp; news before the opening bell — then shortlists 5 sound,
              non-speculative intraday longs with full reasoning and risk management.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {cached && !picksLoading && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" /> Cached
              </Badge>
            )}
            {picks.length === 5 && (
              <Badge variant="outline" className="gap-1 border-gain/40 text-gain bg-gain/10">
                <Zap className="h-3 w-3" /> Avg confidence {avgConfidence}%
              </Badge>
            )}
          </div>
        </div>

        {/* Sentiment + brief */}
        <SentimentHero intel={intel} loading={intelLoading} />

        {/* Two-column layout */}
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* Left: intel + picks */}
          <div className="space-y-5 min-w-0">
            <PremarketIntel intel={intel} loading={intelLoading} />

            {/* Picks section */}
            <section className="rounded-2xl border border-border bg-card/30 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-gain">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Top 5 Intraday Picks</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Ranked by confidence · grounded in real news + computed technicals · each with entry, SL, target &amp; thesis
                  </p>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Analysis failed</AlertTitle>
                  <AlertDescription className="flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <Button size="sm" variant="outline" onClick={() => fetchAll(true)}>
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {picksLoading ? (
                <FirstRunNotice />
              ) : picks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <AlertCircle className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No picks generated. Try re-running the analysis.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => fetchAll(true)}>
                    Re-run analysis
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {picks.map((p) => (
                    <PickCard key={p.symbol} pick={p} onAnalyze={handleAnalyze} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right: risk calc + news */}
          <div className="space-y-5">
            <RiskCalculator pick={activePick} />
            <NewsFeed />
          </div>
        </div>
      </main>

      <SiteFooter lastRun={lastUpdated} />
      <StockDetailSheet pick={activePick} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function FirstRunNotice() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
        <Loader2 className="h-5 w-5 text-gain animate-spin mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-medium">Running pre-market analysis…</div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            The strategist is gathering real-time news &amp; economics via web search, computing technicals
            across the stock universe, and reasoning through 5 disciplined intraday picks. First run takes
            ~30–60 seconds; subsequent loads are instant from cache.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[330px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
