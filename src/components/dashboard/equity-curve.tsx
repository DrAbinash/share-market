"use client";

import { useMemo } from "react";
import { inr } from "./format";
import type { JournalStats } from "./types";

/**
 * Cumulative realised P&L, drawn as a pure-SVG area chart to match the
 * hand-rolled candlestick chart rather than pulling in a charting library for
 * one sparkline.
 */
export function EquityCurve({
  points,
  height = 160,
}: {
  points: JournalStats["equityCurve"];
  height?: number;
}) {
  const W = 720;
  const padL = 8;
  const padR = 64;
  const padT = 12;
  const padB = 20;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;

    // A single closed trade has no line to draw; seed a zero origin so the
    // first result still renders as a step away from breakeven.
    const series = points.length === 1 ? [{ date: "", cumulative: 0 }, ...points] : points;

    const values = series.map((p) => p.cumulative);
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    const pad = (max - min) * 0.1 || 1;
    min -= pad;
    max += pad;
    const range = max - min || 1;

    const plotW = W - padL - padR;
    const plotH = height - padT - padB;
    const x = (i: number) => padL + (series.length === 1 ? plotW / 2 : (i * plotW) / (series.length - 1));
    const y = (v: number) => padT + (1 - (v - min) / range) * plotH;

    const line = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.cumulative)}`).join(" ");
    const area = `${line} L ${x(series.length - 1)} ${y(min)} L ${x(0)} ${y(min)} Z`;

    return { series, line, area, x, y, min, max, zeroY: y(0), plotW, plotH };
  }, [points, height]);

  if (!geometry) {
    return (
      <div
        className="grid place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground"
        style={{ height }}
      >
        Close a trade to start the equity curve.
      </div>
    );
  }

  const final = geometry.series[geometry.series.length - 1].cumulative;
  const positive = final >= 0;
  const stroke = positive ? "var(--gain)" : "var(--loss)";

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Cumulative realised profit and loss">
      {/* breakeven line */}
      <line
        x1={padL}
        y1={geometry.zeroY}
        x2={W - padR}
        y2={geometry.zeroY}
        stroke="var(--border)"
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      <text
        x={W - padR + 6}
        y={geometry.zeroY + 3}
        className="fill-muted-foreground"
        style={{ fontSize: 9 }}
      >
        breakeven
      </text>

      <path d={geometry.area} fill={stroke} opacity={0.12} />
      <path d={geometry.line} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />

      {geometry.series.map((p, i) => (
        <circle key={i} cx={geometry.x(i)} cy={geometry.y(p.cumulative)} r={2} fill={stroke} />
      ))}

      <text
        x={W - padR + 6}
        y={geometry.y(final) + 3}
        fill={stroke}
        style={{ fontSize: 10, fontWeight: 700 }}
      >
        {inr(final, 0)}
      </text>
    </svg>
  );
}
