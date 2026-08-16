"use client";

import { useState } from "react";
import { BookPlus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { suggestQuantity } from "@/lib/journal-math";
import { inr } from "./format";

interface Props {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
}

/**
 * Records a pick as a paper trade, sized from a rupee risk budget rather than a
 * share count — position sizing is the part traders most often get wrong, so
 * the form asks for the number that actually matters.
 */
export function AddToJournal({ symbol, entryPrice, stopLoss, target }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [risk, setRisk] = useState("2000");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const riskAmount = Number(risk) || 0;
  const quantity = suggestQuantity(entryPrice, stopLoss, riskAmount);
  const stopDistance = entryPrice - stopLoss;
  const actualRisk = quantity * stopDistance;
  const potentialReward = quantity * (target - entryPrice);

  const submit = async () => {
    if (quantity <= 0) return;
    setSaving(true);
    try {
      const r = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          entryPrice: round2(entryPrice),
          stopLoss: round2(stopLoss),
          target: round2(target),
          quantity,
          notes: `Taken from the daily pick list`,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to record trade");
      setSaved(true);
      toast({
        title: "Paper trade recorded",
        description: `${quantity} × ${symbol} at ${inr(entryPrice, 0)} — risking ${inr(actualRisk, 0)}`,
      });
      setTimeout(() => setOpen(false), 700);
    } catch (e: any) {
      toast({
        title: "Could not record trade",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="w-full gap-1.5">
          <BookPlus className="h-3.5 w-3.5" />
          Add to paper journal
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold">Paper trade {symbol}</div>
            <p className="text-[11px] text-muted-foreground">
              Size the position from the rupee amount you are willing to lose.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="risk-amount" className="text-xs">
              Risk per trade (₹)
            </Label>
            <Input
              id="risk-amount"
              type="number"
              min={0}
              step={100}
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Entry</dt>
            <dd className="text-right tnum">{inr(entryPrice, 2)}</dd>
            <dt className="text-muted-foreground">Stop</dt>
            <dd className="text-right tnum text-loss">{inr(stopLoss, 2)}</dd>
            <dt className="text-muted-foreground">Target</dt>
            <dd className="text-right tnum text-gain">{inr(target, 2)}</dd>
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="text-right tnum font-semibold">{quantity}</dd>
            <dt className="text-muted-foreground">Actual risk</dt>
            <dd className="text-right tnum text-loss">{inr(actualRisk, 0)}</dd>
            <dt className="text-muted-foreground">Reward at target</dt>
            <dd className="text-right tnum text-gain">{inr(potentialReward, 0)}</dd>
          </dl>

          {quantity <= 0 && (
            <p className="text-[11px] text-warn">
              Risk budget is too small for even one share at this stop distance.
            </p>
          )}

          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={submit}
            disabled={saving || quantity <= 0}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <BookPlus className="h-3.5 w-3.5" />
            )}
            {saved ? "Recorded" : "Record trade"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
