"use client";

import { useMemo, useState } from "react";
import type { Candle } from "./types";
import { inr, num } from "./format";

interface Props {
  candles: Candle[];
  ema20?: number[];
  ema50?: number[];
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  target?: number;
  height?: number;
}

// Pure-SVG candlestick chart with EMA overlays + trade-level references + hover tooltip.
export function CandlestickChart({
  candles,
  ema20 = [],
  ema50 = [],
  entryLow,
  entryHigh,
  stopLoss,
  target,
  height = 320,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => candles.slice(-60), [candles]);
  const W = 720;
  const H = height;
  const padL = 8;
  const padR = 64;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const highs = view.map((c) => c.high);
  const lows = view.map((c) => c.low);
  let min = Math.min(...lows);
  let max = Math.max(...highs);
  // include trade levels in range
  [entryLow, entryHigh, stopLoss, target].forEach((v) => {
    if (typeof v === "number" && !isNaN(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  });
  const pad = (max - min) * 0.06;
  min -= pad;
  max += pad;
  const range = max - min || 1;

  const x = (i: number) => padL + (i + 0.5) * (plotW / view.length);
  const y = (p: number) => padT + (1 - (p - min) / range) * plotH;

  const candleW = Math.max(3, (plotW / view.length) * 0.62);

  // y gridlines (5)
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const v = min + (range * i) / 4;
    return { v, y: y(v) };
  });

  // EMA path builders
  const linePath = (arr: number[]) => {
    const slice = arr.slice(-view.length);
    let d = "";
    slice.forEach((v, i) => {
      // guard against NaN at start
      if (!isFinite(v)) return;
      d += d === "" ? `M ${x(i)} ${y(v)}` : ` L ${x(i)} ${y(v)}`;
    });
    return d;
  };

  const hovered = hover != null ? view[hover] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {/* grid */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={W - padR} y2={g.y} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
            <text x={W - padR + 6} y={g.y + 3} className="fill-muted-foreground" style={{ fontSize: 9 }}>
              {inr(g.v, 0)}
            </text>
          </g>
        ))}

        {/* trade level references */}
        {[
          { v: stopLoss, color: "var(--loss)", label: "SL" },
          { v: target, color: "var(--gain)", label: "TGT" },
          { v: entryLow, color: "var(--warn)", label: "ENTRY" },
          { v: entryHigh, color: "var(--warn)", label: "" },
        ].map((ref, i) =>
          typeof ref.v === "number" && isFinite(ref.v) ? (
            <g key={i}>
              <line x1={padL} y1={y(ref.v)} x2={W - padR} y2={y(ref.v)} stroke={ref.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
              <rect x={W - padR + 2} y={y(ref.v) - 7} width={26} height={14} rx={3} fill={ref.color} opacity={0.18} />
              <text x={W - padR + 6} y={y(ref.v) + 3} fill={ref.color} style={{ fontSize: 9, fontWeight: 700 }}>
                {ref.label}
              </text>
            </g>
          ) : null,
        )}

        {/* EMA lines */}
        {ema50.length > 0 && <path d={linePath(ema50)} stroke="var(--chart-4)" strokeWidth={1.3} fill="none" opacity={0.85} />}
        {ema20.length > 0 && <path d={linePath(ema20)} stroke="var(--warn)" strokeWidth={1.3} fill="none" opacity={0.9} />}

        {/* candles */}
        {view.map((c, i) => {
          const up = c.close >= c.open;
          const color = up ? "var(--gain)" : "var(--loss)";
          const cx = x(i);
          const bodyTop = y(Math.max(c.open, c.close));
          const bodyBot = y(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={color} strokeWidth={1} />
              <rect
                x={cx - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={up ? color : color}
                opacity={up ? 0.9 : 0.95}
              />
              {/* invisible wider hit area */}
              <rect x={cx - (plotW / view.length) / 2} y={padT} width={plotW / view.length} height={plotH} fill="transparent" />
            </g>
          );
        })}

        {/* x labels (sparse) */}
        {view.map((c, i) => {
          if (i % Math.ceil(view.length / 6) !== 0) return null;
          return (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
              {c.date.slice(5)}
            </text>
          );
        })}

        {/* hover crosshair */}
        {hovered && (
          <line x1={x(hover!)} y1={padT} x2={x(hover!)} y2={padT + plotH} stroke="var(--foreground)" strokeWidth={0.7} opacity={0.4} strokeDasharray="3 3" />
        )}
      </svg>

      {/* tooltip */}
      {hovered && (
        <div className="absolute top-2 left-2 rounded-lg border border-border bg-popover/95 backdrop-blur px-2.5 py-1.5 text-[10px] tnum shadow-lg pointer-events-none">
          <div className="font-semibold mb-0.5">{hovered.date}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-muted-foreground">O</span><span>{inr(hovered.open, 1)}</span>
            <span className="text-muted-foreground">H</span><span className="text-gain">{inr(hovered.high, 1)}</span>
            <span className="text-muted-foreground">L</span><span className="text-loss">{inr(hovered.low, 1)}</span>
            <span className="text-muted-foreground">C</span><span>{inr(hovered.close, 1)}</span>
            <span className="text-muted-foreground">Vol</span><span>{num(hovered.volume / 1e6, 1)}M</span>
          </div>
        </div>
      )}

      {/* legend */}
      <div className="absolute top-2 right-2 flex items-center gap-3 text-[10px]">
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[var(--warn)]" />EMA20</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[var(--chart-4)]" />EMA50</span>
      </div>
    </div>
  );
}
