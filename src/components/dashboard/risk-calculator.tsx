"use client";

import { useMemo, useState } from "react";
import { Calculator, Wallet, TrendingUp, ShieldAlert, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StockPick } from "./types";
import { inr, num } from "./format";
import { cn } from "@/lib/utils";

interface Props {
  pick: StockPick | null;
}

export function RiskCalculator({ pick }: Props) {
  const [capital, setCapital] = useState("100000");
  const [riskPct, setRiskPct] = useState("0.75");

  const calc = useMemo(() => {
    const cap = parseFloat(capital) || 0;
    const rp = parseFloat(riskPct) || 0;
    if (!pick || cap <= 0 || rp <= 0) return null;
    const riskAmount = (cap * rp) / 100;
    const entryMid = (pick.entryLow + pick.entryHigh) / 2;
    const stopDist = Math.max(0.01, entryMid - pick.stopLoss);
    const qty = Math.floor(riskAmount / stopDist);
    const exposure = qty * entryMid;
    const rewardPerShare = pick.target - entryMid;
    const potentialReward = qty * rewardPerShare;
    const potentialLoss = qty * stopDist;
    const exposurePct = (exposure / cap) * 100;
    return { riskAmount, entryMid, stopDist, qty, exposure, rewardPerShare, potentialReward, potentialLoss, exposurePct };
  }, [capital, riskPct, pick]);

  return (
    <div className="rounded-2xl border border-border bg-card/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-warn">
          <Calculator className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Position Size Calculator</h2>
          <p className="text-[11px] text-muted-foreground">Risk-based sizing for the selected pick</p>
        </div>
      </div>

      {!pick ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Target className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">Open any pick's analysis to auto-fill the trade levels here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-background/40 p-3 text-xs flex items-center justify-between">
            <span className="text-muted-foreground">Linked Pick</span>
            <span className="font-semibold">{pick.symbol} · {inr(pick.ltp, 0)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="cap" className="text-[10px] uppercase tracking-wide">Capital (₹)</Label>
              <Input id="cap" value={capital} onChange={(e) => setCapital(e.target.value)} className="h-8 tnum" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="risk" className="text-[10px] uppercase tracking-wide">Risk per trade (%)</Label>
              <Input id="risk" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className="h-8 tnum" inputMode="decimal" />
            </div>
          </div>

          {calc && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Result icon={ShieldAlert} label="Risk Amount" value={inr(calc.riskAmount, 0)} tone="loss" />
              <Result icon={TrendingUp} label="Quantity" value={`${num(calc.qty, 0)} sh`} />
              <Result icon={Wallet} label="Exposure" value={inr(calc.exposure, 0)} sub={`${num(calc.exposurePct, 1)}% of cap`} />
              <Result icon={ShieldAlert} label="Stop Distance" value={inr(calc.stopDist, 1)} sub={`@ ${inr(calc.entryMid, 0)}`} tone="loss" />
              <Result icon={Target} label="Potential Reward" value={inr(calc.potentialReward, 0)} tone="gain" />
              <Result icon={ShieldAlert} label="Potential Loss" value={inr(calc.potentialLoss, 0)} tone="loss" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Result({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div
        className={cn(
          "text-sm font-bold tnum",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground tnum">{sub}</div>}
    </div>
  );
}
