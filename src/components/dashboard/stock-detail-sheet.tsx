"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  AlertTriangle,
  Ban,
  Clock,
  Gauge,
  Newspaper,
  ShieldAlert,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { CandlestickChart } from "./candlestick-chart";
import { SignalBreakdown } from "./signal-breakdown";
import { DataSourceBadge } from "./data-source-badge";
import { AddToJournal } from "./add-to-journal";
import { ema } from "@/lib/indicators";
import type { StockDetail, StockPick } from "./types";
import { convictionColor, inr, num, pct } from "./format";
import { cn } from "@/lib/utils";

interface Props {
  /** A full pick renders the trade plan and thesis sections. */
  pick?: StockPick | null;
  /** A bare symbol renders chart + technicals only (used by the screener). */
  symbol?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tnum", tone)}>{value}</div>
    </div>
  );
}

export function StockDetailSheet({ pick, symbol, open, onOpenChange }: Props) {
  const targetSymbol = pick?.symbol ?? symbol ?? null;
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!targetSymbol || !open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset fetch state when the target symbol changes
    setLoading(true);
    setDetail(null);
    fetch(`/api/stock/${encodeURIComponent(targetSymbol)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setDetail(j.data);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [targetSymbol, open]);

  // EMA overlays come from the same shared implementation the server uses,
  // rather than a second local copy that could drift from it.
  const { ema20, ema50 } = useMemo(() => {
    const closes = detail?.candles.map((c) => c.close) ?? [];
    if (closes.length === 0) return { ema20: [] as number[], ema50: [] as number[] };
    return { ema20: ema(closes, 20), ema50: ema(closes, 50) };
  }, [detail]);

  const summary = detail?.summary;
  const headline = pick ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col" side="right">
        {targetSymbol && (
          <>
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="flex flex-wrap items-center gap-2 text-xl">
                    {targetSymbol}
                    {headline && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] capitalize",
                          convictionColor(headline.conviction),
                        )}
                      >
                        {headline.conviction} conviction
                      </Badge>
                    )}
                    <DataSourceBadge source={detail?.source} />
                  </SheetTitle>
                  <SheetDescription className="truncate">
                    {detail?.meta.name ?? headline?.name} · {detail?.meta.sector ?? headline?.sector}
                  </SheetDescription>
                </div>
                {summary && (
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground uppercase">Last close</div>
                    <div className="text-xl font-bold tnum">{inr(summary.lastClose)}</div>
                    <div
                      className={cn(
                        "text-xs tnum",
                        summary.change1d >= 0 ? "text-gain" : "text-loss",
                      )}
                    >
                      {pct(summary.change1d)}
                    </div>
                  </div>
                )}
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 scrollbar-thin">
              <div className="p-5 space-y-5">
                {/* Chart */}
                <div className="rounded-xl border border-border bg-card/40 p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-gain" /> Daily Chart · 60 sessions
                    </span>
                    {summary && (
                      <span
                        className={cn(
                          "text-xs tnum",
                          summary.change1d >= 0 ? "text-gain" : "text-loss",
                        )}
                      >
                        1D {pct(summary.change1d)} · 5D {pct(summary.change5d)} · 20D{" "}
                        {pct(summary.change20d)}
                      </span>
                    )}
                  </div>
                  {loading ? (
                    <Skeleton className="h-[320px] w-full" />
                  ) : detail ? (
                    <CandlestickChart
                      candles={detail.candles}
                      ema20={ema20}
                      ema50={ema50}
                      entryLow={headline?.entryLow}
                      entryHigh={headline?.entryHigh}
                      stopLoss={headline?.stopLoss}
                      target={headline?.target}
                      height={320}
                    />
                  ) : (
                    <div className="h-[320px] grid place-items-center text-sm text-muted-foreground">
                      Chart unavailable
                    </div>
                  )}
                </div>

                {/* Trade plan (pick context only) */}
                {headline && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> Trade Plan
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <StatTile
                        label="Entry Zone"
                        value={`${inr(headline.entryLow, 0)}-${inr(headline.entryHigh, 0)}`}
                      />
                      <StatTile
                        label="Stop Loss"
                        value={inr(headline.stopLoss, 0)}
                        tone="text-loss"
                      />
                      <StatTile label="Target" value={inr(headline.target, 0)} tone="text-gain" />
                      <StatTile
                        label="Risk : Reward"
                        value={`1:${num(headline.riskReward, 2)}`}
                        tone={headline.riskReward >= 2 ? "text-gain" : ""}
                      />
                    </div>
                    <div className="mt-2">
                      <AddToJournal
                        symbol={headline.symbol}
                        entryPrice={(headline.entryLow + headline.entryHigh) / 2}
                        stopLoss={headline.stopLoss}
                        target={headline.target}
                      />
                    </div>
                  </div>
                )}

                {/* Indicators */}
                {summary && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5" /> Technical Indicators
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      <StatTile
                        label="RSI (14)"
                        value={num(summary.rsi14, 1)}
                        tone={
                          summary.rsi14 > 70
                            ? "text-loss"
                            : summary.rsi14 < 35
                              ? "text-warn"
                              : summary.rsi14 >= 50
                                ? "text-gain"
                                : "text-muted-foreground"
                        }
                      />
                      <StatTile
                        label="ADX (14)"
                        value={num(summary.adx14, 1)}
                        tone={summary.adx14 >= 25 ? "text-gain" : "text-muted-foreground"}
                      />
                      <StatTile label="EMA 20" value={inr(summary.ema20, 0)} />
                      <StatTile label="EMA 50" value={inr(summary.ema50, 0)} />
                      <StatTile
                        label="MACD Hist"
                        value={num(summary.macdHist, 2)}
                        tone={summary.macdHist >= 0 ? "text-gain" : "text-loss"}
                      />
                      <StatTile
                        label="Supertrend"
                        value={`${inr(summary.supertrend, 0)} ${summary.supertrendDir === "up" ? "↑" : "↓"}`}
                        tone={summary.supertrendDir === "up" ? "text-gain" : "text-loss"}
                      />
                      <StatTile
                        label="Stoch %K/%D"
                        value={`${num(summary.stochK, 0)}/${num(summary.stochD, 0)}`}
                      />
                      <StatTile label="ATR %" value={`${num(summary.atrPct, 2)}%`} />
                      <StatTile
                        label="Vol Ratio"
                        value={`${num(summary.volumeRatio, 2)}x`}
                        tone={summary.volumeRatio >= 1.3 ? "text-gain" : ""}
                      />
                      <StatTile
                        label="Bollinger %B"
                        value={num(summary.bbPercentB, 2)}
                        tone={summary.bbPercentB > 1 ? "text-warn" : ""}
                      />
                      <StatTile label="BB Width" value={`${num(summary.bbWidthPct, 1)}%`} />
                      <StatTile label="20D VWAP" value={inr(summary.vwap20, 0)} />
                      <StatTile label="Swing High" value={inr(summary.swingHigh, 0)} />
                      <StatTile label="Swing Low" value={inr(summary.swingLow, 0)} />
                      <StatTile
                        label="OBV 10D"
                        value={`${summary.obvSlope >= 0 ? "+" : ""}${num(summary.obvSlope, 1)}%`}
                        tone={summary.obvSlope >= 0 ? "text-gain" : "text-loss"}
                      />
                      <StatTile label="Period High" value={inr(summary.periodHigh, 0)} />
                    </div>

                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      <Zap className="h-4 w-4 text-gain shrink-0" />
                      <p className="text-xs">{summary.setupLabel}</p>
                    </div>
                  </div>
                )}

                {/* Pivot levels */}
                {summary && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> Pivot Levels (next session)
                    </h4>
                    <div className="grid grid-cols-5 gap-2">
                      <StatTile label="S2" value={inr(summary.pivots.s2, 0)} tone="text-loss" />
                      <StatTile label="S1" value={inr(summary.pivots.s1, 0)} tone="text-loss" />
                      <StatTile label="Pivot" value={inr(summary.pivots.pp, 0)} />
                      <StatTile label="R1" value={inr(summary.pivots.r1, 0)} tone="text-gain" />
                      <StatTile label="R2" value={inr(summary.pivots.r2, 0)} tone="text-gain" />
                    </div>
                  </div>
                )}

                {/* Score breakdown */}
                {summary && (
                  <SignalBreakdown score={summary.bullishScore} signals={summary.signals} />
                )}

                {/* Pick-specific narrative */}
                {headline && (
                  <>
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Technical Thesis
                      </h4>
                      <p className="text-sm leading-relaxed text-foreground/90 rounded-lg border border-border bg-background/40 p-3">
                        {headline.technicalThesis}
                      </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Newspaper className="h-3.5 w-3.5" /> Fundamental Catalyst
                        </h4>
                        <p className="text-xs leading-relaxed rounded-lg border border-border bg-background/40 p-3">
                          {headline.fundamentalCatalyst}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5" /> News Trigger
                        </h4>
                        <p className="text-xs leading-relaxed rounded-lg border border-border bg-background/40 p-3">
                          {headline.newsTrigger}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-warn" /> Risks &amp; Invalidation
                      </h4>
                      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                        <ul className="space-y-1.5">
                          {headline.risks.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-warn mt-0.5">▸</span>
                              <span className="leading-relaxed">{r}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-start gap-2 text-xs pt-2 border-t border-border">
                          <Ban className="h-3.5 w-3.5 text-loss mt-0.5 shrink-0" />
                          <span className="leading-relaxed">
                            <span className="font-semibold text-loss">Exit if:</span>{" "}
                            {headline.invalidation}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border bg-background/40 p-3 flex items-start gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Time Horizon
                          </div>
                          <div className="text-xs">{headline.timeHorizon}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3 flex items-start gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Position Guidance
                          </div>
                          <div className="text-xs">{headline.positionGuidance}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-warn mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Educational analysis only, not investment advice. Markets carry risk — always use
                    your own judgement and risk management.
                    {detail?.source === "synthetic" &&
                      " The prices shown here come from the built-in simulator because no live data provider was reachable; verify every level on your broker terminal before trading."}
                  </p>
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
