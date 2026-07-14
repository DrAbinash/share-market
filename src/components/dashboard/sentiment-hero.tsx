"use client";

import { Gauge, Globe2, CalendarClock, Layers, Sparkles } from "lucide-react";
import type { PremarketIntel } from "./types";
import { sentimentColor } from "./format";
import { cn } from "@/lib/utils";

interface Props {
  intel: PremarketIntel | null;
  loading?: boolean;
}

// Semicircular gauge from -100..100
function SentimentGauge({ score }: { score: number }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const angle = (clamped / 100) * 90; // -90..90 deg from vertical
  const radius = 70;
  const cx = 90;
  const cy = 90;
  const needleX = cx + radius * Math.sin((angle * Math.PI) / 180);
  const needleY = cy - radius * Math.cos((angle * Math.PI) / 180);

  // Arc segments: risk-off (red), cautious (amber), mixed (slate), risk-on (green)
  const seg = (start: number, end: number, color: string) => {
    const a0 = (start / 100) * 90;
    const a1 = (end / 100) * 90;
    const p0 = { x: cx + radius * Math.sin((a0 * Math.PI) / 180), y: cy - radius * Math.cos((a0 * Math.PI) / 180) };
    const p1 = { x: cx + radius * Math.sin((a1 * Math.PI) / 180), y: cy - radius * Math.cos((a1 * Math.PI) / 180) };
    return (
      <path
        d={`M ${p0.x} ${p0.y} A ${radius} ${radius} 0 0 1 ${p1.x} ${p1.y}`}
        stroke={color}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
        opacity={0.85}
      />
    );
  };

  return (
    <svg viewBox="0 0 180 110" className="w-full max-w-[220px]">
      {seg(-100, -40, "var(--loss)")}
      {seg(-40, -10, "var(--warn)")}
      {seg(-10, 10, "var(--muted-foreground)")}
      {seg(10, 40, "var(--warn)")}
      {seg(40, 100, "var(--gain)")}
      {/* needle */}
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="var(--foreground)" />
      <text x={cx} y={108} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
        {clamped > 0 ? `+${clamped}` : clamped}
      </text>
    </svg>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted/60 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold tnum truncate">{value}</div>
      </div>
    </div>
  );
}

export function SentimentHero({ intel, loading }: Props) {
  if (loading || !intel) {
    return (
      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-border bg-card/40 p-5 h-[260px] shimmer" />
        <div className="rounded-2xl border border-border bg-card/40 p-5 h-[260px] shimmer" />
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* Gauge card */}
      <div className="rounded-2xl border border-border bg-card/40 p-5 flex flex-col items-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
          <Gauge className="h-3.5 w-3.5" />
          Market Sentiment
        </div>
        <SentimentGauge score={intel.sentimentScore} />
        <div className={cn("text-lg font-bold mt-1", sentimentColor(intel.sentiment))}>
          {intel.sentiment}
        </div>
        <div className="text-[11px] text-muted-foreground text-center mt-1">
          {intel.sentimentScore > 20
            ? "Bias positive — favour longs with discipline"
            : intel.sentimentScore < -20
              ? "Bias negative — trade smaller, demand confirmation"
              : "Balanced — selective, theme-driven trades only"}
        </div>
      </div>

      {/* Summary + stats */}
      <div className="rounded-2xl border border-border bg-card/40 p-5 flex flex-col">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide mb-2">
          <Sparkles className="h-3.5 w-3.5" />
          Today's Pre-Market Brief
          <span className="ml-auto text-[10px] tnum normal-case tracking-normal">as of {intel.asOf}</span>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">{intel.summary}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-auto pt-4">
          <Stat icon={Globe2} label="Global Cues" value={intel.globalCues.length} />
          <Stat icon={CalendarClock} label="Econ Events" value={intel.economicEvents.length} />
          <Stat icon={Layers} label="Sector Tilts" value={intel.sectorTilts.length} />
          <Stat icon={Sparkles} label="Key Themes" value={intel.keyThemes.length} />
        </div>
      </div>
    </section>
  );
}
