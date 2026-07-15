"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Trophy,
  TrendingDown,
  Clock,
  Target,
  ShieldX,
  BarChart3,
  Loader2,
  Calendar,
  Award,
  Skull,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface TrackRecordRow {
  date: string;
  symbol: string;
  name: string;
  sector: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target: number;
  ltp: number;
  confidence: number;
  conviction: string;
  riskReward: number;
  source: "live-llm" | "simulated";
  outcome: "target" | "sl" | "time-exit" | "not-triggered" | "live";
  outcomeLabel: string;
  realizedR: number;
  exitPrice: number | null;
  exitNote: string;
}

interface TrackRecordSummary {
  from: string;
  to: string;
  totalPicks: number;
  livePicks: number;
  tradesTaken: number;
  targetHits: number;
  slHits: number;
  timeExits: number;
  notTriggered: number;
  winRate: number;
  avgRealizedR: number;
  totalR: number;
  liveCount: number;
  simulatedCount: number;
}

type Range = "1d" | "db" | "7d" | "1m" | "custom";

const outcomeStyles: Record<string, string> = {
  target: "bg-emerald-100 text-emerald-800 border-emerald-300",
  sl: "bg-rose-100 text-rose-800 border-rose-300",
  "time-exit": "bg-amber-100 text-amber-800 border-amber-300",
  "not-triggered": "bg-slate-100 text-slate-600 border-slate-300",
  live: "bg-sky-100 text-sky-800 border-sky-300",
};

const outcomeIcons: Record<string, any> = {
  target: Trophy,
  sl: ShieldX,
  "time-exit": Clock,
  "not-triggered": Calendar,
  live: Loader2,
};

const rColor = (r: number) => (r > 0 ? "text-emerald-700" : r < 0 ? "text-rose-700" : "text-slate-500");

function inr(n: number, decimals = 0): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatDate(d: string): string {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function TrackRecord() {
  const [range, setRange] = useState<Range>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<TrackRecordRow[]>([]);
  const [summary, setSummary] = useState<TrackRecordSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (r: Range, f?: string, t?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (r === "custom" && f && t) {
        params.set("range", "custom");
        params.set("from", f);
        params.set("to", t);
      } else {
        params.set("range", r);
      }
      const res = await fetch(`/api/track-record?${params}`);
      const j = await res.json();
      if (j.ok && j.data) {
        setRows(j.data.rows || []);
        setSummary(j.data.summary || null);
        if (r !== "custom" && j.data.summary) {
          setFrom(j.data.summary.from);
          setTo(j.data.summary.to);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_("7d");
  }, [fetch_]);

  const handleRange = (r: Range) => {
    setRange(r);
    if (r !== "custom") fetch_(r);
  };

  const handleCustomApply = () => {
    if (from && to) {
      setRange("custom");
      fetch_("custom", from, to);
    }
  };

  return (
    <section className="rounded-2xl overflow-hidden shadow-2xl shadow-black/20 border border-slate-300">
      {/* Bright (light-themed) container — stands out from the dark dashboard */}
      <div className="bg-gradient-to-br from-slate-50 to-white text-slate-900">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900">Prediction Track Record</h2>
              <p className="text-[11px] text-slate-500">
                Past picks vs actual market outcomes · entry / target / SL resolution
              </p>
            </div>
          </div>
        </div>

        {/* Range selector */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {([
              ["1d", "1 Day"],
              ["db", "Day Before"],
              ["7d", "7 Days"],
              ["1m", "1 Month"],
            ] as [Range, string][]).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={range === key ? "default" : "outline"}
                onClick={() => handleRange(key)}
                className={cn(
                  "h-7 text-xs rounded-full",
                  range === key
                    ? "bg-slate-900 text-white hover:bg-slate-800 border-slate-900"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100",
                )}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-7 w-[130px] text-xs border-slate-300 bg-white"
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 w-[130px] text-xs border-slate-300 bg-white"
            />
            <Button
              size="sm"
              onClick={handleCustomApply}
              disabled={!from || !to}
              className="h-7 text-xs rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Apply
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        {loading || !summary ? (
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : (
          <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <StatCard label="Total Picks" value={String(summary.totalPicks)} icon={BarChart3} tone="slate" />
            <StatCard
              label="Win Rate"
              value={`${summary.winRate}%`}
              icon={Trophy}
              tone={summary.winRate >= 40 ? "emerald" : summary.winRate >= 25 ? "amber" : "rose"}
            />
            <StatCard
              label="Total R"
              value={`${summary.totalR > 0 ? "+" : ""}${summary.totalR.toFixed(2)}R`}
              icon={summary.totalR >= 0 ? Award : Skull}
              tone={summary.totalR >= 0 ? "emerald" : "rose"}
            />
            <StatCard label="Avg R / Trade" value={`${summary.avgRealizedR > 0 ? "+" : ""}${summary.avgRealizedR.toFixed(2)}R`} icon={Target} tone="slate" />
            <StatCard label="Target Hits" value={String(summary.targetHits)} icon={Trophy} tone="emerald" />
            <StatCard label="SL Hits" value={String(summary.slHits)} icon={TrendingDown} tone="rose" />
            <StatCard label="Time Exits" value={String(summary.timeExits)} icon={Clock} tone="amber" />
          </div>
        )}

        {/* Source transparency note */}
        {summary && (summary.liveCount > 0 || summary.simulatedCount > 0) && (
          <div className="px-5 pb-2 flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {summary.liveCount} live LLM picks
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              {summary.simulatedCount} back-simulated
            </span>
            <span className="italic">
              (Simulated history fills dates before the first real run. As AlphaDesk runs daily on your NAS, real picks replace these automatically.)
            </span>
          </div>
        )}

        {/* Bright table */}
        <div className="border-t border-slate-200">
          <ScrollArea className="h-[440px] scrollbar-thin">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded bg-slate-100" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                <Calendar className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                No picks in this date range.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100 hover:bg-slate-100 border-slate-200">
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5">Date</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5">Symbol</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 hidden md:table-cell">Sector</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 text-right">Entry</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 text-right hidden sm:table-cell">SL</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 text-right hidden sm:table-cell">Target</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 text-right hidden lg:table-cell">Conf</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 text-right hidden lg:table-cell">R:R</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5">Outcome</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 text-right">Realized</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold py-2.5 text-right hidden xl:table-cell">Exit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const Icon = outcomeIcons[r.outcome] || Clock;
                    return (
                      <TableRow
                        key={`${r.date}-${r.symbol}-${i}`}
                        className="border-slate-100 hover:bg-slate-50 data-[state=selected]:bg-slate-100"
                      >
                        <TableCell className="text-xs font-medium text-slate-700 py-2 whitespace-nowrap">
                          {formatDate(r.date)}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900">{r.symbol}</span>
                            {r.source === "simulated" && (
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" title="Back-simulated" />
                            )}
                            {r.source === "live-llm" && (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Live LLM pick" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] text-slate-500 py-2 hidden md:table-cell">{r.sector}</TableCell>
                        <TableCell className="text-xs text-slate-700 py-2 text-right tnum whitespace-nowrap">
                          {inr(r.entryLow, 0)}–{inr(r.entryHigh, 0)}
                        </TableCell>
                        <TableCell className="text-xs text-rose-600 py-2 text-right tnum hidden sm:table-cell whitespace-nowrap">{inr(r.stopLoss, 0)}</TableCell>
                        <TableCell className="text-xs text-emerald-600 py-2 text-right tnum hidden sm:table-cell whitespace-nowrap">{inr(r.target, 0)}</TableCell>
                        <TableCell className="text-xs text-slate-500 py-2 text-right tnum hidden lg:table-cell">{r.confidence}</TableCell>
                        <TableCell className="text-xs text-slate-500 py-2 text-right tnum hidden lg:table-cell">1:{r.riskReward.toFixed(1)}</TableCell>
                        <TableCell className="py-2">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] gap-1 px-1.5 py-0.5 font-medium border", outcomeStyles[r.outcome])}
                          >
                            <Icon className={cn("h-2.5 w-2.5", r.outcome === "live" && "animate-spin")} />
                            {r.outcomeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("text-xs font-bold py-2 text-right tnum", rColor(r.realizedR))}>
                          {r.outcome === "live" || r.outcome === "not-triggered" ? "—" : `${r.realizedR > 0 ? "+" : ""}${r.realizedR.toFixed(2)}R`}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 py-2 text-right tnum hidden xl:table-cell whitespace-nowrap">
                          {r.exitPrice ? inr(r.exitPrice, 0) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>

        {/* Footer note */}
        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-400 flex items-center justify-between">
          <span>
            {summary ? `${summary.tradesTaken} trades resolved · ${summary.notTriggered} not triggered · ${summary.livePicks} live` : ""}
          </span>
          <span className="italic">Outcomes computed from daily OHLC · educational only</span>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: any;
  tone: "emerald" | "rose" | "amber" | "slate";
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2 flex items-center gap-2.5", tones[tone])}>
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <div className="min-w-0 leading-tight">
        <div className="text-[9px] uppercase tracking-wide opacity-60">{label}</div>
        <div className="text-sm font-bold tnum truncate">{value}</div>
      </div>
    </div>
  );
}
