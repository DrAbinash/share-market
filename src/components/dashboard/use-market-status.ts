"use client";

import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/market-status";
import type { MarketStatus } from "./types";

// Ticks the IST market status once a second on the client.
//
// This used to be a hand-rolled copy of the server logic, which meant the
// session boundaries could drift between the two and the client knew nothing
// about trading holidays. It now calls the same pure `getMarketStatus()` —
// that module has no server-only imports, so it bundles cleanly for the browser.
//
// Returns null on the first render so SSR and hydration agree; the clock only
// starts after mount.
export function useMarketStatus(): MarketStatus | null {
  const [status, setStatus] = useState<MarketStatus | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only clock must be seeded on mount (SSR renders null)
    setStatus(getMarketStatus());
    const id = setInterval(() => setStatus(getMarketStatus()), 1000);
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
