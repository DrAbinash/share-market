"use client";

import { Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectorBreadth } from "./types";

/** Map a signed % move onto a background tint. Deliberately coarse — the point
 *  is at-a-glance rotation, not precise magnitude. */
function tint(change: number): string {
  if (change >= 1.5) return "bg-emerald-500/30 border-emerald-500/50 text-emerald-200";
  if (change >= 0.5) return "bg-emerald-500/20 border-emerald-500/35 text-emerald-300";
  if (change > 0) return "bg-emerald-500/10 border-emerald-500/25 text-emerald-300/90";
  if (change === 0) return "bg-muted border-border text-muted-foreground";
  if (change > -0.5) return "bg-rose-500/10 border-rose-500/25 text-rose-300/90";
  if (change > -1.5) return "bg-rose-500/20 border-rose-500/35 text-rose-300";
  return "bg-rose-500/30 border-rose-500/50 text-rose-200";
}

export function SectorHeatmap({ sectors }: { sectors: SectorBreadth[] }) {
  if (sectors.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-gain">
          <Layers3 className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Sector Rotation</h2>
          <p className="text-[11px] text-muted-foreground">
            Average 1-day move and composite score per sector · advancing vs declining names
          </p>
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {sectors.map((s) => (
          <div
            key={s.sector}
            className={cn("rounded-lg border px-3 py-2 transition-colors", tint(s.avgChange1d))}
            title={`${s.advancing} advancing / ${s.declining} declining of ${s.count}`}
          >
            <div className="text-[11px] font-medium leading-tight truncate" title={s.sector}>
              {s.sector}
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span className="text-base font-bold tnum">
                {s.avgChange1d >= 0 ? "+" : ""}
                {s.avgChange1d.toFixed(2)}%
              </span>
              <span className="text-[10px] opacity-80 tnum">score {s.avgScore}</span>
            </div>
            <div className="text-[10px] opacity-75 tnum mt-0.5">
              {s.advancing}↑ · {s.declining}↓ · {s.count} names
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
