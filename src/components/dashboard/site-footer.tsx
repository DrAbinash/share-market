import { ShieldAlert, HeartPulse } from "lucide-react";

export function SiteFooter({ lastRun }: { lastRun?: string }) {
  return (
    <footer className="mt-auto border-t border-border bg-card/30">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-3">
        <div className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/5 p-3">
          <ShieldAlert className="h-4 w-4 text-warn mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Risk Disclaimer:</span> AlphaDesk is an educational
            research tool that aggregates publicly available news and applies systematic technical + AI analysis.
            Outputs are <span className="text-foreground">not investment advice, not a solicitation, and not a guarantee</span> of
            any outcome. Intraday trading in equity derivatives carries substantial risk of capital loss. Chart
            data shown here is representative/synthetic for illustration — always verify live levels, news, and
            your broker's margin rules before placing any order. The user assumes full responsibility for all
            trading decisions. Consult a SEBI-registered investment adviser before investing.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <HeartPulse className="h-3.5 w-3.5 text-gain animate-pulse-dot" />
            <span>AlphaDesk Pre-Market Strategist · NSE/BSE coverage</span>
          </div>
          <div className="tnum">
            {lastRun ? `Last analysis: ${lastRun}` : "Awaiting first analysis run"}
          </div>
        </div>
      </div>
    </footer>
  );
}
