"use client";

import { Gauge, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SignalContribution } from "./types";

/**
 * Shows exactly which signals produced a stock's composite score.
 *
 * The score used to arrive as a bare number with no way to interrogate it —
 * which is the worst property a trading signal can have. Each contributing
 * signal is now listed with its weight and the observation behind it.
 */
export function SignalBreakdown({
  score,
  signals,
}: {
  score: number;
  signals: SignalContribution[];
}) {
  if (!signals || signals.length === 0) return null;

  const maxAbs = Math.max(...signals.map((s) => Math.abs(s.points)), 1);
  const bullish = signals.filter((s) => s.points > 0).length;
  const bearish = signals.filter((s) => s.points < 0).length;

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5" /> Why this score?
      </h4>

      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-border">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Composite score</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-bold tnum",
                score >= 70
                  ? "bg-gain/15 text-gain"
                  : score >= 55
                    ? "bg-warn/15 text-warn"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {score}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground tnum">
            {bullish} supporting · {bearish} opposing
          </div>
        </div>

        <ul className="space-y-1.5">
          {signals.map((s) => {
            const positive = s.points > 0;
            const width = (Math.abs(s.points) / maxAbs) * 100;
            return (
              <li key={s.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-medium truncate">
                  {positive ? (
                    <TrendingUp className="h-3 w-3 text-gain shrink-0" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-loss shrink-0" />
                  )}
                  <span className="truncate" title={s.label}>
                    {s.label}
                  </span>
                </span>

                <span className="min-w-0">
                  <span className="block h-1 w-full rounded-full bg-muted overflow-hidden">
                    <span
                      className={cn("block h-full rounded-full", positive ? "bg-gain" : "bg-loss")}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="block text-[10px] text-muted-foreground truncate mt-0.5">
                    {s.detail}
                  </span>
                </span>

                <span
                  className={cn(
                    "text-[11px] font-semibold tnum tabular-nums w-8 text-right",
                    positive ? "text-gain" : "text-loss",
                  )}
                >
                  {positive ? "+" : ""}
                  {s.points}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground pt-1 border-t border-border">
          <Minus className="h-3 w-3 mt-0.5 shrink-0" />
          Signals are summed, scaled and centred on 50. This is a rules-based technical score, not a
          forecast.
        </p>
      </div>
    </div>
  );
}
