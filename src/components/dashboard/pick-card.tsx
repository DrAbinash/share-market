"use client";

import { Target, ShieldAlert, TrendingUp, ChevronRight, Gauge, Activity, Zap, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StockPick } from "./types";
import { inr, num, convictionColor } from "./format";
import { cn } from "@/lib/utils";

interface Props {
  pick: StockPick;
  onAnalyze: (symbol: string) => void;
}

function ConfidenceRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 70 ? "var(--gain)" : value >= 50 ? "var(--warn)" : "var(--loss)";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} stroke="var(--muted)" strokeWidth="4" fill="none" opacity={0.35} />
        <circle
          cx="28"
          cy="28"
          r={r}
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-sm font-bold tnum">{value}</span>
      </div>
    </div>
  );
}

function LevelRow({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "gain" | "loss" | "neutral" }) {
  const toneClass = tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-background/40 border border-border px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className={cn("text-xs font-semibold tnum", toneClass)}>{value}</span>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" | "neutral" }) {
  const t = tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : tone === "neutral" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1 text-center">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-[11px] font-semibold tnum", t)}>{value}</div>
    </div>
  );
}

export function PickCard({ pick, onAnalyze }: Props) {
  const rrTone = pick.riskReward >= 2.5 ? "gain" : pick.riskReward >= 1.8 ? "neutral" : "loss";
  const rsiTone = pick.indicators.rsi14 > 70 ? "loss" : pick.indicators.rsi14 < 35 ? "neutral" : pick.indicators.rsi14 >= 50 ? "gain" : "loss";

  return (
    <Card className="relative overflow-hidden p-0 border-border bg-card/40 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group">
      {/* Rank ribbon */}
      <div className="absolute top-0 left-0 z-10 flex items-center gap-1 bg-gradient-to-r from-emerald-500/90 to-emerald-600/90 text-emerald-950 text-[10px] font-bold px-2.5 py-1 rounded-br-lg">
        #{pick.rank} PICK
      </div>

      <div className="p-4 pt-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base tracking-tight truncate">{pick.symbol}</h3>
              <Badge variant="outline" className={cn("text-[9px] capitalize", convictionColor(pick.conviction))}>
                {pick.conviction}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{pick.name}</p>
            <p className="text-[10px] text-muted-foreground/70 truncate">{pick.sector}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ConfidenceRing value={pick.confidence} />
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">confidence</span>
          </div>
        </div>

        {/* LTP + R:R */}
        <div className="flex items-end justify-between mb-3 pb-3 border-b border-border">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">LTP</div>
            <div className="text-lg font-bold tnum">{inr(pick.ltp)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Risk : Reward</div>
            <div className={cn("text-lg font-bold tnum", rrTone === "gain" ? "text-gain" : rrTone === "loss" ? "text-loss" : "")}>
              1 : {num(pick.riskReward, 2)}
            </div>
          </div>
        </div>

        {/* Levels */}
        <div className="grid gap-1.5 mb-3">
          <LevelRow icon={TrendingUp} label="Entry Zone" value={`${inr(pick.entryLow, 0)} – ${inr(pick.entryHigh, 0)}`} tone="neutral" />
          <LevelRow icon={ShieldAlert} label="Stop Loss" value={inr(pick.stopLoss, 0)} tone="loss" />
          <LevelRow icon={Target} label="Target" value={inr(pick.target, 0)} tone="gain" />
          {pick.target2 && (
            <LevelRow icon={Target} label="Stretch Target" value={inr(pick.target2, 0)} tone="gain" />
          )}
        </div>

        {/* Indicator chips */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          <Chip label="RSI" value={num(pick.indicators.rsi14, 0)} tone={rsiTone as any} />
          <Chip
            label="EMA"
            value={pick.indicators.ema20 > pick.indicators.ema50 ? "Bull" : "Bear"}
            tone={pick.indicators.ema20 > pick.indicators.ema50 ? "gain" : "loss"}
          />
          <Chip
            label="MACD"
            value={pick.indicators.macdHist >= 0 ? "↑" : "↓"}
            tone={pick.indicators.macdHist >= 0 ? "gain" : "loss"}
          />
          <Chip
            label="Vol"
            value={`${num(pick.indicators.volumeRatio, 1)}x`}
            tone={pick.indicators.volumeRatio >= 1.3 ? "gain" : "neutral"}
          />
        </div>

        {/* Setup */}
        <div className="flex items-start gap-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1.5 mb-2">
          <Zap className="h-3 w-3 text-gain mt-0.5 shrink-0" />
          <p className="text-[11px] leading-snug text-foreground/90">{pick.indicators.setupLabel}</p>
        </div>

        {/* Thesis */}
        <div className="flex items-start gap-1.5 mb-1.5">
          <Gauge className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">{pick.technicalThesis}</p>
        </div>
        <div className="flex items-start gap-1.5 mb-3">
          <Newspaper className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">{pick.fundamentalCatalyst}</p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="w-full gap-1 group-hover:bg-emerald-500/15"
          onClick={() => onAnalyze(pick.symbol)}
        >
          <Activity className="h-3.5 w-3.5" />
          Full Analysis
          <ChevronRight className="h-3.5 w-3.5 ml-auto group-hover:translate-x-0.5 transition-transform" />
        </Button>
      </div>
    </Card>
  );
}
