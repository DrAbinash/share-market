// Indian market session status (IST). NSE pre-open 09:00-09:15, regular
// 09:15-15:30, post-close settlement 15:30-16:00. All comparisons are done in
// IST regardless of the server's timezone.

import type { MarketPhase, MarketStatus } from "./types";

export type { MarketPhase, MarketStatus };

const IST_TZ = "Asia/Calcutta";

// Session boundaries as minutes past IST midnight.
const PRE_OPEN_START = 9 * 60; // 09:00
const REGULAR_START = 9 * 60 + 15; // 09:15
const REGULAR_END = 15 * 60 + 30; // 15:30
const POST_CLOSE_END = 16 * 60; // 16:00

/**
 * NSE trading holidays, keyed by year.
 *
 * Most Indian market holidays follow lunar calendars, so they cannot be
 * computed — the exchange publishes them annually by circular. Refresh this
 * table each December from the official NSE holiday circular.
 *
 * A year absent from this table degrades to weekend-only detection rather than
 * silently asserting that every weekday is a trading day.
 */
export const NSE_HOLIDAYS: Record<string, Record<string, string>> = {
  "2025": {
    "2025-02-26": "Mahashivratri",
    "2025-03-14": "Holi",
    "2025-03-31": "Id-Ul-Fitr (Ramzan Id)",
    "2025-04-10": "Shri Mahavir Jayanti",
    "2025-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2025-04-18": "Good Friday",
    "2025-05-01": "Maharashtra Day",
    "2025-08-15": "Independence Day",
    "2025-08-27": "Ganesh Chaturthi",
    "2025-10-02": "Mahatma Gandhi Jayanti / Dussehra",
    "2025-10-21": "Diwali Laxmi Pujan",
    "2025-10-22": "Diwali Balipratipada",
    "2025-11-05": "Prakash Gurpurb Sri Guru Nanak Dev",
    "2025-12-25": "Christmas",
  },
  // The 2026 entries below are the fixed-date national holidays, which are
  // certain. Lunar-calendar dates (Holi, Diwali, Id, Mahavir Jayanti, Ganesh
  // Chaturthi) must be added from the NSE circular once published — they are
  // deliberately omitted rather than guessed.
  "2026": {
    "2026-01-26": "Republic Day",
    "2026-05-01": "Maharashtra Day",
    "2026-08-15": "Independence Day",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-12-25": "Christmas",
  },
};

/** True when the calendar has data for the year of `dateIST`. */
export function hasHolidayData(dateIST: string): boolean {
  return NSE_HOLIDAYS[dateIST.slice(0, 4)] !== undefined;
}

/** The holiday name for an IST date, or null when it is not a listed holiday. */
export function getHoliday(dateIST: string): string | null {
  return NSE_HOLIDAYS[dateIST.slice(0, 4)]?.[dateIST] ?? null;
}

/** Weekend or listed holiday. */
export function isTradingHoliday(dateIST: string, weekday: number): boolean {
  if (weekday === 0 || weekday === 6) return true;
  return getHoliday(dateIST) !== null;
}

export interface ISTParts {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 Sun .. 6 Sat
  minutes: number; // minutes past midnight
  clock: string; // HH:MM:SS
}

/** Decompose an instant into IST calendar/clock parts. Uses Intl parts rather
 *  than the old `new Date(toLocaleString(...))` round-trip, which parsed a
 *  locale string as if it were local time. */
export function istParts(now: Date = new Date()): ISTParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(now).map((x) => [x.type, x.value]),
  ) as Record<string, string>;

  // Some ICU versions render midnight as hour "24".
  const hour = parseInt(p.hour, 10) % 24;
  const minute = parseInt(p.minute, 10);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
    minutes: hour * 60 + minute,
    clock: `${String(hour).padStart(2, "0")}:${p.minute}:${p.second}`,
  };
}

export function getISTDate(now: Date = new Date()): string {
  return istParts(now).date;
}

/**
 * Resolve the current NSE session phase.
 *
 * A pure function of `now`, so the same logic is unit-testable and reusable by
 * the client-side ticking hook.
 */
export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { date, weekday, minutes, clock } = istParts(now);
  const base = { nowIST: `${date} ${clock}`, dateIST: date };

  if (weekday === 0 || weekday === 6) {
    return {
      ...base,
      phase: "weekend",
      label: "Market Closed · Weekend",
      isOpen: false,
      isPreOpen: false,
      nextSessionLabel: "Opens Monday 09:00 IST (pre-open)",
      accent: "slate",
    };
  }

  const holiday = getHoliday(date);
  if (holiday) {
    return {
      ...base,
      phase: "holiday",
      label: `Market Closed · ${holiday}`,
      isOpen: false,
      isPreOpen: false,
      nextSessionLabel: "Next trading session 09:00 IST",
      accent: "slate",
      holidayName: holiday,
    };
  }

  if (minutes >= PRE_OPEN_START && minutes < REGULAR_START) {
    return {
      ...base,
      phase: "pre-open",
      label: "Pre-Open Session",
      isOpen: false,
      isPreOpen: true,
      nextSessionLabel: "Regular trading starts 09:15 IST",
      accent: "amber",
    };
  }

  if (minutes >= REGULAR_START && minutes < REGULAR_END) {
    return {
      ...base,
      phase: "open",
      label: "Market Open",
      isOpen: true,
      isPreOpen: false,
      nextSessionLabel: `Closes 15:30 IST · ${formatHm(REGULAR_END - minutes)} left`,
      accent: "emerald",
    };
  }

  if (minutes >= REGULAR_END && minutes < POST_CLOSE_END) {
    return {
      ...base,
      phase: "post-close",
      label: "Post-Close Settlement",
      isOpen: false,
      isPreOpen: false,
      nextSessionLabel: "Next session tomorrow 09:00 IST",
      accent: "slate",
    };
  }

  // Before pre-open, or after post-close.
  const beforeOpen = minutes < PRE_OPEN_START;
  const openCountdown = beforeOpen ? formatHm(PRE_OPEN_START - minutes) : undefined;

  return {
    ...base,
    phase: "closed",
    label: beforeOpen ? "Pre-Market (Awaiting Open)" : "Market Closed",
    isOpen: false,
    isPreOpen: false,
    openCountdown,
    nextSessionLabel: beforeOpen
      ? `Pre-open begins 09:00 IST${openCountdown ? ` · in ${openCountdown}` : ""}`
      : "Next session tomorrow 09:00 IST",
    accent: beforeOpen ? "amber" : "slate",
  };
}

/** Minutes → "HH:MM". The previous implementation divided a minutes value into
 *  "MM:SS", so a 3-hour wait rendered as "03:00" and read as three minutes. */
export function formatHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
