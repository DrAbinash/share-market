"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Newspaper, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { NewsItem } from "./types";
import { timeAgo } from "./format";

interface Props {
  initial?: NewsItem[];
}

export function NewsFeed({ initial = [] }: Props) {
  const [items, setItems] = useState<NewsItem[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const r = await fetch(`/api/news${refresh ? "?force=1" : ""}`);
      const j = await r.json();
      if (j.ok && Array.isArray(j.data)) setItems(j.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (initial.length === 0) load(false);
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-rose-500/10 text-loss">
          <Newspaper className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Live Market News</h2>
          <p className="text-[11px] text-muted-foreground">Real-time web search · auto-refresh</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={() => load(true)}
          disabled={refreshing}
          title="Refresh news"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <ScrollArea className="h-[420px] pr-2 scrollbar-thin">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center">No news retrieved</div>
        ) : (
          <div className="space-y-2">
            {items.map((n, i) => (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border bg-background/40 p-3 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-gain truncate max-w-[140px]">{n.source}</span>
                  {n.date && <span className="text-[10px] text-muted-foreground tnum">· {timeAgo(n.date)}</span>}
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs font-medium leading-snug line-clamp-2 mb-1">{n.title}</p>
                {n.snippet && <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{n.snippet}</p>}
              </a>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
