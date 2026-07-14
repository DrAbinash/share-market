"use client";

import { Activity, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIstClock, useMarketStatus } from "./use-market-status";
import { cn } from "@/lib/utils";

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
  lastUpdated?: string;
}

const accentMap: Record<string, string> = {
  emerald: "text-gain border-gain/40 bg-gain/10",
  amber: "text-warn border-warn/40 bg-warn/10",
  rose: "text-loss border-loss/40 bg-loss/10",
  slate: "text-muted-foreground border-border bg-muted",
};

const dotMap: Record<string, string> = {
  emerald: "bg-gain",
  amber: "bg-warn",
  rose: "bg-loss",
  slate: "bg-muted-foreground",
};

export function MarketHeader({ onRefresh, refreshing, lastUpdated }: Props) {
  const status = useMarketStatus();
  const clock = useIstClock();

  return (
    <header className="sticky top-0 z-40 glass border-b border-border">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-emerald-950 shadow-lg shadow-emerald-500/20">
            <TrendingUp className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="font-semibold tracking-tight text-[15px] sm:text-base truncate">
              AlphaDesk
            </div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground -mt-0.5 truncate">
              Pre-Market Intraday Strategist
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Market status pill */}
          {status && (
            <div
              className={cn(
                "hidden sm:flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                accentMap[status.accent],
              )}
              title={status.nextSessionLabel}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full animate-pulse-dot",
                  dotMap[status.accent],
                  status.isOpen && "animate-pulse-dot",
                )}
              />
              {status.label}
              {status.openCountdown && (
                <span className="tnum text-[11px] opacity-80">· {status.openCountdown}</span>
              )}
            </div>
          )}

          {/* IST clock */}
          <div className="hidden md:flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="tnum font-mono">{clock}</span>
            <span className="text-muted-foreground">IST</span>
          </div>

          {/* Last updated */}
          {lastUpdated && (
            <span className="hidden lg:inline text-[11px] text-muted-foreground tnum">
              Updated {lastUpdated}
            </span>
          )}

          {/* Refresh */}
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">{refreshing ? "Analyzing…" : "Re-run"}</span>
          </Button>
        </div>
      </div>

      {/* Mobile status strip */}
      {status && (
        <div className="sm:hidden border-t border-border px-4 py-1.5 flex items-center justify-between text-[11px]">
          <div className={cn("flex items-center gap-1.5", accentMap[status.accent])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", dotMap[status.accent])} />
            {status.label}
          </div>
          <span className="tnum font-mono text-muted-foreground">{clock} IST</span>
        </div>
      )}
    </header>
  );
}
