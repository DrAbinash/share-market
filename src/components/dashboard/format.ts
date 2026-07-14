export function inr(n: number, opts: { decimals?: number; compact?: boolean } = {}): string {
  const { decimals = 2, compact = false } = opts;
  if (compact && Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (compact && Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function pct(n: number, decimals = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

export function num(n: number, decimals = 2): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function compactVol(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function timeAgo(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function sentimentColor(s: string): string {
  switch (s) {
    case "Risk-On":
      return "text-gain";
    case "Cautious":
      return "text-warn";
    case "Risk-Off":
      return "text-loss";
    default:
      return "text-muted-foreground";
  }
}

export function convictionColor(c: string): string {
  switch (c) {
    case "high":
      return "text-gain border-gain/40 bg-gain/10";
    case "medium":
      return "text-warn border-warn/40 bg-warn/10";
    default:
      return "text-muted-foreground border-border bg-muted";
  }
}
