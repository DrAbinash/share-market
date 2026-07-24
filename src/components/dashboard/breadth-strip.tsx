"use client";

import { Activity, ArrowDown, ArrowUp, Gauge, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScreenerResponse } from "./types";

type Breadth = ScreenerResponse["breadth"];

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss" | "neutral";
}) {
  const toneClass =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("text-base font-bold tnum leading-tight mt-0.5", toneClass)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground tnum">{sub}</div>}
    </div>
  );
}

/** Market-internals strip: advance/decline, participation above the moving
 *  averages, and how much of the universe is actually trending. */
export function BreadthStrip({ breadth }: { breadth: Breadth }) {
  if (breadth.total === 0) return null;

  const adRatio =
    breadth.declining === 0
      ? breadth.advancing > 0
        ? "∞"
        : "0.00"
      : (breadth.advancing / breadth.declining).toFixed(2);

  const advPct = Math.round((breadth.advancing / breadth.total) * 100);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          icon={ArrowUp}
          label="Advancing"
          value={String(breadth.advancing)}
          sub={`${advPct}% of ${breadth.total}`}
          tone="gain"
        />
        <Tile
          icon={ArrowDown}
          label="Declining"
          value={String(breadth.declining)}
          sub={`A/D ratio ${adRatio}`}
          tone="loss"
        />
        <Tile
          icon={TrendingUp}
          label="Above EMA20"
          value={`${breadth.aboveEma20}/${breadth.total}`}
          sub="short-term participation"
        />
        <Tile
          icon={TrendingUp}
          label="Above EMA50"
          value={`${breadth.aboveEma50}/${breadth.total}`}
          sub="medium-term participation"
        />
        <Tile
          icon={Activity}
          label="Trending (ADX≥25)"
          value={`${breadth.strongTrend}/${breadth.total}`}
          sub="rest are ranging"
        />
        <Tile
          icon={Gauge}
          label="Avg score"
          value={String(breadth.avgScore)}
          sub={`avg RSI ${breadth.avgRsi}`}
          tone={breadth.avgScore >= 60 ? "gain" : breadth.avgScore <= 45 ? "loss" : "neutral"}
        />
      </div>

      {/* Advance/decline bar */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-gain" style={{ width: `${(breadth.advancing / breadth.total) * 100}%` }} />
        <div className="bg-loss" style={{ width: `${(breadth.declining / breadth.total) * 100}%` }} />
      </div>
    </div>
  );
}
