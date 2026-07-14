"use client";

import { useEffect, useState } from "react";
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
  Gauge,
  ShieldAlert,
  Target,
  TrendingUp,
  Activity,
  AlertTriangle,
  Clock,
  Wallet,
  Newspaper,
  Zap,
  Ban,
} from "lucide-react";
import { CandlestickChart } from "./candlestick-chart";
import type { StockPick, StockDetail } from "./types";
import { inr, num, pct, convictionColor } from "./format";
import { cn } from "@/lib/utils";

interface Props {
  pick: StockPick | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tnum", tone)}>{value}</div>
    </div>
  );
}

export function StockDetailSheet({ pick, open, onOpenChange }: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pick || !open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset fetch state when target pick changes
    setLoading(true);
    setDetail(null);
    fetch(`/api/stock/${encodeURIComponent(pick.symbol)}`)
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
  }, [pick, open]);

  const closes = detail?.candles.map((c) => c.close) ?? [];
  const ema20 = closes.length ? ema(closes, 20) : [];
  const ema50 = closes.length ? ema(closes, 50) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col" side="right">
        {pick && (
          <>
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2 text-xl">
                    {pick.symbol}
                    <Badge variant="outline" className={cn("text-[10px] capitalize", convictionColor(pick.conviction))}>
                      {pick.conviction} conviction
                    </Badge>
                  </SheetTitle>
                  <SheetDescription className="truncate">{pick.name} · {pick.sector}</SheetDescription>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-muted-foreground uppercase">LTP</div>
                  <div className="text-xl font-bold tnum">{inr(pick.ltp)}</div>
                  <div className={cn("text-xs tnum", pick.ltp >= pick.indicators.ema20 ? "text-gain" : "text-loss")}>
                    vs EMA20 {inr(pick.indicators.ema20, 0)}
                  </div>
                </div>
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
                    {detail && (
                      <span className={cn("text-xs tnum", detail.summary.change1d >= 0 ? "text-gain" : "text-loss")}>
                        1D {pct(detail.summary.change1d)} · 5D {pct(detail.summary.change5d)} · 20D {pct(detail.summary.change20d)}
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
                      entryLow={pick.entryLow}
                      entryHigh={pick.entryHigh}
                      stopLoss={pick.stopLoss}
                      target={pick.target}
                      height={320}
                    />
                  ) : null}
                </div>

                {/* Trade plan */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" /> Trade Plan
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatTile label="Entry Zone" value={`${inr(pick.entryLow, 0)}-${inr(pick.entryHigh, 0)}`} />
                    <StatTile label="Stop Loss" value={inr(pick.stopLoss, 0)} tone="text-loss" />
                    <StatTile label="Target" value={inr(pick.target, 0)} tone="text-gain" />
                    <StatTile label="Risk : Reward" value={`1:${num(pick.riskReward, 2)}`} tone={pick.riskReward >= 2 ? "text-gain" : ""} />
                  </div>
                </div>

                {/* Indicators */}
                {detail && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5" /> Technical Indicators
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      <StatTile
                        label="RSI (14)"
                        value={num(detail.summary.rsi14, 1)}
                        tone={detail.summary.rsi14 > 70 ? "text-loss" : detail.summary.rsi14 < 35 ? "text-warn" : detail.summary.rsi14 >= 50 ? "text-gain" : "text-muted-foreground"}
                      />
                      <StatTile label="EMA 20" value={inr(detail.summary.ema20, 0)} />
                      <StatTile label="EMA 50" value={inr(detail.summary.ema50, 0)} />
                      <StatTile
                        label="MACD Hist"
                        value={num(detail.summary.macdHist, 2)}
                        tone={detail.summary.macdHist >= 0 ? "text-gain" : "text-loss"}
                      />
                      <StatTile label="ATR %" value={num(detail.summary.atrPct, 2) + "%"} />
                      <StatTile
                        label="Vol Ratio"
                        value={num(detail.summary.volumeRatio, 2) + "x"}
                        tone={detail.summary.volumeRatio >= 1.3 ? "text-gain" : ""}
                      />
                      <StatTile label="Swing High" value={inr(detail.summary.swingHigh, 0)} />
                      <StatTile label="Swing Low" value={inr(detail.summary.swingLow, 0)} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      <Zap className="h-4 w-4 text-gain shrink-0" />
                      <p className="text-xs">{detail.summary.setupLabel}</p>
                    </div>
                  </div>
                )}

                {/* Thesis */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> Technical Thesis
                  </h4>
                  <p className="text-sm leading-relaxed text-foreground/90 rounded-lg border border-border bg-background/40 p-3">
                    {pick.technicalThesis}
                  </p>
                </div>

                {/* Catalyst */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Newspaper className="h-3.5 w-3.5" /> Fundamental Catalyst
                    </h4>
                    <p className="text-xs leading-relaxed rounded-lg border border-border bg-background/40 p-3">{pick.fundamentalCatalyst}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" /> News Trigger
                    </h4>
                    <p className="text-xs leading-relaxed rounded-lg border border-border bg-background/40 p-3">{pick.newsTrigger}</p>
                  </div>
                </div>

                {/* Risks + invalidation */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-warn" /> Risks & Invalidation
                  </h4>
                  <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                    <ul className="space-y-1.5">
                      {pick.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-warn mt-0.5">▸</span>
                          <span className="leading-relaxed">{r}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-start gap-2 text-xs pt-2 border-t border-border">
                      <Ban className="h-3.5 w-3.5 text-loss mt-0.5 shrink-0" />
                      <span className="leading-relaxed"><span className="font-semibold text-loss">Exit if:</span> {pick.invalidation}</span>
                    </div>
                  </div>
                </div>

                {/* Execution */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-background/40 p-3 flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Time Horizon</div>
                      <div className="text-xs">{pick.timeHorizon}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3 flex items-start gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Position Guidance</div>
                      <div className="text-xs">{pick.positionGuidance}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-warn mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Educational analysis only, not investment advice. Markets carry risk — always use your own
                    judgement and risk management. Synthetic chart data is used for illustration; verify live levels on your broker terminal before trading.
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
