import { describe, expect, test } from "bun:test";
import {
  formatHm,
  getHoliday,
  getISTDate,
  getMarketStatus,
  hasHolidayData,
  istParts,
  isTradingHoliday,
  NSE_HOLIDAYS,
} from "../src/lib/market-status";

/** An instant expressed as an IST wall-clock time (IST is UTC+5:30). */
function ist(date: string, hh: number, mm: number): Date {
  return new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`);
}

describe("istParts", () => {
  test("reports IST wall-clock regardless of the host timezone", () => {
    const p = istParts(ist("2025-06-10", 9, 30));
    expect(p.date).toBe("2025-06-10");
    expect(p.minutes).toBe(9 * 60 + 30);
  });

  test("handles the UTC day boundary correctly", () => {
    // 20:00 UTC on the 9th is 01:30 IST on the 10th.
    const p = istParts(new Date("2025-06-09T20:00:00Z"));
    expect(p.date).toBe("2025-06-10");
    expect(p.minutes).toBe(90);
  });

  test("renders IST midnight as hour 0, not 24", () => {
    expect(istParts(ist("2025-06-10", 0, 0)).minutes).toBe(0);
  });
});

describe("getISTDate", () => {
  test("returns an ISO date string", () => {
    expect(getISTDate(ist("2025-06-10", 12, 0))).toBe("2025-06-10");
  });
});

describe("getMarketStatus", () => {
  // 2025-06-10 is a Tuesday and not a listed holiday.
  const TRADING_DAY = "2025-06-10";

  test("closed before pre-open, with a countdown", () => {
    const s = getMarketStatus(ist(TRADING_DAY, 6, 30));
    expect(s.phase).toBe("closed");
    expect(s.isOpen).toBe(false);
    expect(s.openCountdown).toBe("02:30");
  });

  test("pre-open between 09:00 and 09:15", () => {
    const s = getMarketStatus(ist(TRADING_DAY, 9, 5));
    expect(s.phase).toBe("pre-open");
    expect(s.isPreOpen).toBe(true);
    expect(s.isOpen).toBe(false);
  });

  test("open between 09:15 and 15:30", () => {
    expect(getMarketStatus(ist(TRADING_DAY, 9, 15)).phase).toBe("open");
    expect(getMarketStatus(ist(TRADING_DAY, 12, 0)).isOpen).toBe(true);
    expect(getMarketStatus(ist(TRADING_DAY, 15, 29)).phase).toBe("open");
  });

  test("post-close between 15:30 and 16:00", () => {
    const s = getMarketStatus(ist(TRADING_DAY, 15, 45));
    expect(s.phase).toBe("post-close");
    expect(s.isOpen).toBe(false);
  });

  test("closed after 16:00, with no countdown", () => {
    const s = getMarketStatus(ist(TRADING_DAY, 20, 0));
    expect(s.phase).toBe("closed");
    expect(s.openCountdown).toBeUndefined();
  });

  test("weekend is detected before any session logic", () => {
    // 2025-06-14 is a Saturday; 09:30 would otherwise be "open".
    const s = getMarketStatus(ist("2025-06-14", 9, 30));
    expect(s.phase).toBe("weekend");
    expect(s.isOpen).toBe(false);
  });

  test("a listed holiday closes the market during regular hours", () => {
    // 2025-08-15 (Independence Day) is a Friday.
    const s = getMarketStatus(ist("2025-08-15", 11, 0));
    expect(s.phase).toBe("holiday");
    expect(s.isOpen).toBe(false);
    expect(s.holidayName).toBe("Independence Day");
  });

  test("boundary minutes land in the expected phase", () => {
    expect(getMarketStatus(ist(TRADING_DAY, 8, 59)).phase).toBe("closed");
    expect(getMarketStatus(ist(TRADING_DAY, 9, 0)).phase).toBe("pre-open");
    expect(getMarketStatus(ist(TRADING_DAY, 9, 14)).phase).toBe("pre-open");
    expect(getMarketStatus(ist(TRADING_DAY, 15, 30)).phase).toBe("post-close");
    expect(getMarketStatus(ist(TRADING_DAY, 16, 0)).phase).toBe("closed");
  });
});

describe("holiday calendar", () => {
  test("recognises a listed holiday", () => {
    expect(getHoliday("2025-12-25")).toBe("Christmas");
    expect(getHoliday("2025-06-10")).toBeNull();
  });

  test("reports whether the year is covered at all", () => {
    expect(hasHolidayData("2025-06-10")).toBe(true);
    expect(hasHolidayData("1999-06-10")).toBe(false);
  });

  test("treats weekends as non-trading regardless of the calendar", () => {
    expect(isTradingHoliday("2025-06-14", 6)).toBe(true);
    expect(isTradingHoliday("2025-06-15", 0)).toBe(true);
    expect(isTradingHoliday("2025-06-10", 2)).toBe(false);
  });

  test("every calendar entry is a well-formed date inside its own year", () => {
    for (const [year, days] of Object.entries(NSE_HOLIDAYS)) {
      for (const date of Object.keys(days)) {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(date.slice(0, 4)).toBe(year);
        expect(Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())).toBe(false);
      }
    }
  });
});

describe("formatHm", () => {
  test("renders hours and minutes, not minutes and seconds", () => {
    expect(formatHm(150)).toBe("02:30");
    expect(formatHm(45)).toBe("00:45");
    expect(formatHm(0)).toBe("00:00");
  });
});
