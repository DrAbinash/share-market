"use client";

import { useEffect, useState } from "react";
import type { MarketStatus } from "./types";

// Computes IST market status on the client and ticks every second.
export function useMarketStatus(): MarketStatus | null {
  const [status, setStatus] = useState<MarketStatus | null>(null);

  useEffect(() => {
    const TZ = "Asia/Calcutta";
    function compute(): MarketStatus {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
      });
      const parts = Object.fromEntries(
        fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
      ) as Record<string, string>;
      const hour = parseInt(parts.hour, 10);
      const minute = parseInt(parts.minute, 10);
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
      const minutes = hour * 60 + minute;
      const dateIST = `${parts.year}-${parts.month}-${parts.day}`;
      const nowIST = new Date().toLocaleString("en-IN", { timeZone: TZ });

      const isWeekend = day === 0 || day === 6;
      if (isWeekend) {
        return {
          phase: "weekend",
          label: "Market Closed · Weekend",
          isOpen: false,
          isPreOpen: false,
          nowIST,
          dateIST,
          nextSessionLabel: "Opens Monday 09:00 IST (pre-open)",
          accent: "slate",
        };
      }
      if (minutes >= 540 && minutes < 555) {
        return {
          phase: "pre-open",
          label: "Pre-Open Session",
          isOpen: false,
          isPreOpen: true,
          nowIST,
          dateIST,
          nextSessionLabel: "Regular trading starts 09:15 IST",
          accent: "amber",
        };
      }
      if (minutes >= 555 && minutes < 930) {
        return {
          phase: "open",
          label: "Market Open",
          isOpen: true,
          isPreOpen: false,
          nowIST,
          dateIST,
          nextSessionLabel: "Closes 15:30 IST",
          accent: "emerald",
        };
      }
      if (minutes >= 930 && minutes < 960) {
        return {
          phase: "post-close",
          label: "Post-Close Settlement",
          isOpen: false,
          isPreOpen: false,
          nowIST,
          dateIST,
          nextSessionLabel: "Next session tomorrow 09:00 IST",
          accent: "slate",
        };
      }
      const beforeOpen = minutes < 540;
      let openCountdown: string | undefined;
      if (beforeOpen) {
        const diff = 540 - minutes;
        const mm = Math.floor(diff / 60);
        const ss = diff % 60;
        openCountdown = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      }
      return {
        phase: "closed",
        label: beforeOpen ? "Pre-Market (Awaiting Open)" : "Market Closed",
        isOpen: false,
        isPreOpen: false,
        nowIST,
        dateIST,
        openCountdown,
        nextSessionLabel: beforeOpen
          ? `Pre-open 09:00 IST${openCountdown ? ` · in ${openCountdown}` : ""}`
          : "Next session tomorrow 09:00 IST",
        accent: beforeOpen ? "amber" : "slate",
      };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only clock must be seeded on mount (SSR renders null)
    setStatus(compute());
    const id = setInterval(() => setStatus(compute()), 1000);
    return () => clearInterval(id);
  }, []);

  return status;
}

export function useIstClock(): string {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () =>
      setT(
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "Asia/Calcutta",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}
