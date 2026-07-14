"use client";

import { Globe2, CalendarClock, Layers3, Newspaper, ArrowDownUp, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PremarketIntel } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  intel: PremarketIntel | null;
  loading?: boolean;
}

const biasStyle: Record<string, string> = {
  bullish: "text-gain border-gain/40 bg-gain/10",
  bearish: "text-loss border-loss/40 bg-loss/10",
  neutral: "text-muted-foreground border-border bg-muted",
};

const impactStyle: Record<string, string> = {
  high: "bg-loss/15 text-loss border-loss/30",
  medium: "bg-warn/15 text-warn border-warn/30",
  low: "bg-muted text-muted-foreground border-border",
};

function Loading() {
  return <div className="h-[280px] rounded-xl shimmer" />;
}

export function PremarketIntel({ intel, loading }: Props) {
  if (loading || !intel) {
    return (
      <section className="rounded-2xl border border-border bg-card/30 p-4 sm:p-5">
        <Loading />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-gain">
          <ArrowDownUp className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Pre-Market Intelligence</h2>
          <p className="text-[11px] text-muted-foreground">Global cues, economic calendar, flows & sector rotation</p>
        </div>
      </div>

      <Tabs defaultValue="global">
        <TabsList className="mb-3 h-auto flex-wrap justify-start gap-1 bg-muted/50">
          <TabsTrigger value="global" className="gap-1.5 text-xs"><Globe2 className="h-3.5 w-3.5" /> Global Cues</TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5 text-xs"><CalendarClock className="h-3.5 w-3.5" /> Economic Events</TabsTrigger>
          <TabsTrigger value="sectors" className="gap-1.5 text-xs"><Layers3 className="h-3.5 w-3.5" /> Sector Tilts</TabsTrigger>
          <TabsTrigger value="themes" className="gap-1.5 text-xs"><Newspaper className="h-3.5 w-3.5" /> Key Themes</TabsTrigger>
        </TabsList>

        {/* Global cues */}
        <TabsContent value="global" className="mt-0">
          <ScrollArea className="h-[280px] pr-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {intel.globalCues.length === 0 && <Empty label="No global cues parsed" />}
              {intel.globalCues.map((c, i) => {
                const up = /^[\+\d]/.test(c.change || "") && !/^-/.test(c.change || "");
                const down = /^-/.test(c.change || "");
                return (
                  <div key={i} className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      <span className={cn("text-sm font-semibold tnum shrink-0", up ? "text-gain" : down ? "text-loss" : "text-muted-foreground")}>
                        {c.change || "—"}
                      </span>
                    </div>
                    {c.note && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{c.note}</p>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">FII / DII Flows</div>
              <p className="text-xs leading-relaxed">{intel.fiidii}</p>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Economic events */}
        <TabsContent value="events" className="mt-0">
          <ScrollArea className="h-[280px] pr-3">
            <div className="space-y-2">
              {intel.economicEvents.length === 0 && <Empty label="No major events scheduled today" />}
              {intel.economicEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs font-mono tnum text-muted-foreground shrink-0 w-16">{e.time}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{e.event}</div>
                    {e.forecast && <div className="text-[11px] text-muted-foreground mt-0.5">Forecast: {e.forecast}</div>}
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] capitalize", impactStyle[e.impact])}>{e.impact}</Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Sector tilts */}
        <TabsContent value="sectors" className="mt-0">
          <ScrollArea className="h-[280px] pr-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {intel.sectorTilts.length === 0 && <Empty label="No sector tilts parsed" />}
              {intel.sectorTilts.map((s, i) => (
                <div key={i} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium">{s.sector}</span>
                    <Badge variant="outline" className={cn("text-[10px] capitalize gap-1", biasStyle[s.bias])}>
                      {s.bias === "bullish" ? <TrendingUp className="h-3 w-3" /> : s.bias === "bearish" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {s.bias}
                    </Badge>
                  </div>
                  {s.reason && <p className="text-[11px] text-muted-foreground leading-snug">{s.reason}</p>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Key themes */}
        <TabsContent value="themes" className="mt-0">
          <ScrollArea className="h-[280px] pr-3">
            <div className="space-y-2">
              {intel.keyThemes.length === 0 && <Empty label="No key themes parsed" />}
              {intel.keyThemes.map((t, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-gain text-xs font-bold tnum">{i + 1}</div>
                  <p className="text-sm leading-snug">{t}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-xs text-muted-foreground italic py-6 text-center">{label}</div>;
}
