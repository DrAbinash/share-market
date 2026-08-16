"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { inr, num, pct } from "./format";
import type { ScreenerRow } from "./types";

type SortKey = keyof Pick<
  ScreenerRow,
  | "symbol"
  | "ltp"
  | "change1d"
  | "change5d"
  | "change20d"
  | "rsi14"
  | "adx14"
  | "atrPct"
  | "volumeRatio"
  | "bullishScore"
  | "distanceFromHigh"
>;

const COLUMNS: { key: SortKey; label: string; align?: "right"; title?: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "ltp", label: "LTP", align: "right" },
  { key: "change1d", label: "1D", align: "right" },
  { key: "change5d", label: "5D", align: "right" },
  { key: "change20d", label: "20D", align: "right" },
  { key: "rsi14", label: "RSI", align: "right", title: "Relative Strength Index (14)" },
  { key: "adx14", label: "ADX", align: "right", title: "Trend strength — 25+ is a real trend" },
  { key: "atrPct", label: "ATR%", align: "right", title: "Average True Range as % of price" },
  { key: "volumeRatio", label: "Vol", align: "right", title: "Volume vs 20-day average" },
  { key: "distanceFromHigh", label: "vs 20D Hi", align: "right" },
  { key: "bullishScore", label: "Score", align: "right", title: "Composite technical score" },
];

interface Props {
  rows: ScreenerRow[];
  onSelect: (symbol: string) => void;
  onWatch?: (symbol: string) => void;
  watched?: Set<string>;
}

export function ScreenerTable({ rows, onSelect, onWatch, watched }: Props) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [setup, setSetup] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("bullishScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sectors = useMemo(
    () => [...new Set(rows.map((r) => r.sector))].sort(),
    [rows],
  );
  const setups = useMemo(() => [...new Set(rows.map((r) => r.setupLabel))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (sector !== "all" && r.sector !== sector) return false;
      if (setup !== "all" && r.setupLabel !== setup) return false;
      if (!q) return true;
      return r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    });

    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, sector, setup, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Symbol reads naturally A→Z; every numeric column is most useful highest-first.
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by symbol or name…"
            className="pl-8 h-9 text-xs"
            aria-label="Filter stocks"
          />
        </div>
        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger className="h-9 w-full sm:w-[190px] text-xs" aria-label="Filter by sector">
            <SelectValue placeholder="All sectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={setup} onValueChange={setSetup}>
          <SelectTrigger className="h-9 w-full sm:w-[230px] text-xs" aria-label="Filter by setup">
            <SelectValue placeholder="All setups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All setups</SelectItem>
            {setups.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Showing {visible.length} of {rows.length} names
      </div>

      {/* Table — horizontally scrollable on narrow screens */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  title={col.title}
                  className={cn(
                    "px-2.5 py-2 font-medium text-muted-foreground whitespace-nowrap",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-foreground transition-colors",
                      sortKey === col.key && "text-foreground",
                    )}
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-2.5 py-2 text-left font-medium text-muted-foreground">
                Setup
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.symbol}
                className="border-t border-border hover:bg-muted/30 transition-colors"
              >
                <td className="px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => onSelect(r.symbol)}
                    className="text-left hover:text-gain transition-colors"
                  >
                    <div className="font-semibold">{r.symbol}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                      {r.sector}
                    </div>
                  </button>
                </td>
                <td className="px-2.5 py-2 text-right tnum">{inr(r.ltp, 0)}</td>
                <NumCell value={r.change1d} render={(v) => pct(v, 2)} />
                <NumCell value={r.change5d} render={(v) => pct(v, 1)} />
                <NumCell value={r.change20d} render={(v) => pct(v, 1)} />
                <td
                  className={cn(
                    "px-2.5 py-2 text-right tnum",
                    r.rsi14 > 70 ? "text-loss" : r.rsi14 >= 55 ? "text-gain" : "",
                  )}
                >
                  {num(r.rsi14, 1)}
                </td>
                <td
                  className={cn("px-2.5 py-2 text-right tnum", r.adx14 >= 25 && "text-gain font-medium")}
                >
                  {num(r.adx14, 1)}
                </td>
                <td className="px-2.5 py-2 text-right tnum">{num(r.atrPct, 2)}</td>
                <td
                  className={cn(
                    "px-2.5 py-2 text-right tnum",
                    r.volumeRatio >= 1.3 && "text-gain font-medium",
                  )}
                >
                  {num(r.volumeRatio, 2)}x
                </td>
                <NumCell value={r.distanceFromHigh} render={(v) => pct(v, 1)} />
                <td className="px-2.5 py-2 text-right">
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 font-semibold tnum",
                      r.bullishScore >= 70
                        ? "bg-gain/15 text-gain"
                        : r.bullishScore >= 55
                          ? "bg-warn/15 text-warn"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.bullishScore}
                  </span>
                </td>
                <td className="px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        r.supertrendDir === "up" ? "bg-gain" : "bg-loss",
                      )}
                      title={`Supertrend ${r.supertrendDir}`}
                    />
                    <span className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                      {r.setupLabel}
                    </span>
                  </div>
                </td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap">
                  {onWatch && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => onWatch(r.symbol)}
                      aria-label={`Toggle watchlist for ${r.symbol}`}
                    >
                      <Eye
                        className={cn("h-3.5 w-3.5", watched?.has(r.symbol) && "text-gain")}
                      />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onSelect(r.symbol)}
                  >
                    Chart
                  </Button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No stocks match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">
          Score = weighted composite of trend, momentum, volume &amp; volatility signals
        </Badge>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-gain" /> Supertrend up
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-loss" /> Supertrend down
        </span>
      </div>
    </div>
  );
}

function NumCell({ value, render }: { value: number; render: (v: number) => string }) {
  return (
    <td
      className={cn(
        "px-2.5 py-2 text-right tnum",
        value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted-foreground",
      )}
    >
      {render(value)}
    </td>
  );
}
