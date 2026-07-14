// Indian market session status (IST). NSE pre-open 09:00-09:15, regular 09:15-15:30.
// All comparisons done in IST regardless of server TZ.

export type MarketPhase = "pre-open" | "open" | "post-close" | "closed" | "weekend";

export interface MarketStatus {
  phase: MarketPhase;
  label: string;
  isOpen: boolean;
  isPreOpen: boolean;
  nowIST: string; // ISO string in IST
  dateIST: string; // YYYY-MM-DD
  openCountdown?: string; // mm:ss until 09:15 if before open
  nextSessionLabel: string;
  accent: "emerald" | "amber" | "rose" | "slate";
}

const IST_TZ = "Asia/Calcutta";

function nowInIST(): Date {
  // Convert "now" to IST by formatting and parsing back.
  const s = new Date().toLocaleString("en-US", { timeZone: IST_TZ });
  return new Date(s);
}

export function getISTDate(d: Date = nowInIST()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getMarketStatus(): MarketStatus {
  const now = nowInIST();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Weekend
  if (day === 0 || day === 6) {
    return {
      phase: "weekend",
      label: "Market Closed · Weekend",
      isOpen: false,
      isPreOpen: false,
      nowIST: now.toLocaleString("en-IN", { timeZone: IST_TZ }),
      dateIST: getISTDate(now),
      nextSessionLabel: "Opens Monday 09:00 IST (pre-open)",
      accent: "slate",
    };
  }

  // Weekday phases (IST)
  // 09:00-09:15 pre-open
  // 09:15-15:30 open
  // 15:30-16:00 post-close
  if (minutes >= 540 && minutes < 555) {
    return {
      phase: "pre-open",
      label: "Pre-Open Session",
      isOpen: false,
      isPreOpen: true,
      nowIST: now.toLocaleString("en-IN", { timeZone: IST_TZ }),
      dateIST: getISTDate(now),
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
      nowIST: now.toLocaleString("en-IN", { timeZone: IST_TZ }),
      dateIST: getISTDate(now),
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
      nowIST: now.toLocaleString("en-IN", { timeZone: IST_TZ }),
      dateIST: getISTDate(now),
      nextSessionLabel: "Next session tomorrow 09:00 IST",
      accent: "slate",
    };
  }

  // Before open or after close
  const beforeOpen = minutes < 540;
  let countdown: string | undefined;
  if (beforeOpen) {
    const diff = 540 - minutes;
    const mm = Math.floor(diff / 60);
    const ss = diff % 60;
    countdown = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  return {
    phase: beforeOpen ? "closed" : "closed",
    label: beforeOpen ? "Pre-Market (Awaiting Open)" : "Market Closed",
    isOpen: false,
    isPreOpen: false,
    nowIST: now.toLocaleString("en-IN", { timeZone: IST_TZ }),
    dateIST: getISTDate(now),
    openCountdown: countdown,
    nextSessionLabel: beforeOpen
      ? `Pre-open begins 09:00 IST${countdown ? ` · in ${countdown}` : ""}`
      : "Next session tomorrow 09:00 IST",
    accent: beforeOpen ? "amber" : "slate",
  };
}
