import type { Instrument, Rules } from "./types";

export const IST_OFFSET = 5.5 * 60; // minutes from UTC
export const OPEN_MIN = 9 * 60 + 15; // 09:15 IST
export const CLOSE_MIN = 15 * 60 + 30; // 15:30 IST
export const BAR_MIN = 5;
export const SESSION_BARS = 75; // 09:15 → 15:30 in 5-minute bars
export const TICK = 0.05; // NSE equity tick

/**
 * NSE equity trading holidays. The 2025 list is the published exchange list.
 * 2026/2027 entries are the national/fixed festivals; the app labels this list
 * as "check nseindia.com" in Settings and derives historical sessions from the
 * bundled data, so a missing holiday can never fabricate a session.
 */
export const NSE_HOLIDAYS: Record<string, string> = {
  // 2025
  "2025-02-26": "Mahashivratri",
  "2025-03-14": "Holi",
  "2025-03-31": "Id-Ul-Fitr",
  "2025-04-10": "Mahavir Jayanti",
  "2025-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
  "2025-04-18": "Good Friday",
  "2025-05-01": "Maharashtra Day",
  "2025-08-15": "Independence Day",
  "2025-08-27": "Ganesh Chaturthi",
  "2025-10-02": "Mahatma Gandhi Jayanti / Dussehra",
  "2025-10-21": "Diwali Laxmi Pujan",
  "2025-10-22": "Balipratipada",
  "2025-11-05": "Prakash Gurpurb",
  "2025-12-25": "Christmas",
  // 2026 — national holidays and the fixed-date closures
  "2026-01-26": "Republic Day",
  "2026-04-03": "Good Friday",
  "2026-05-01": "Maharashtra Day",
  "2026-08-15": "Independence Day",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-12-25": "Christmas",
  // 2027
  "2027-01-26": "Republic Day",
  "2027-03-26": "Good Friday",
  "2027-05-01": "Maharashtra Day",
  "2027-08-15": "Independence Day",
  "2027-10-02": "Mahatma Gandhi Jayanti",
  "2027-12-25": "Christmas",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A Date whose UTC getters read as IST wall-clock. */
export function istDate(ts: number): Date {
  return new Date(ts + IST_OFFSET * 60_000);
}

export function istParts(ts: number) {
  const d = istDate(ts);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
  };
}

export function istDateStr(ts: number): string {
  const p = istParts(ts);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.day)}`;
}

export function istTimeStr(ts: number): string {
  const p = istParts(ts);
  return `${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
}

/** HH:MM:SS on the IST wall clock (never the device's own time zone). */
export function istClockStr(ts: number): string {
  const p = istParts(ts);
  return `${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}:${pad(p.seconds)}`;
}

export function dateLabel(dateStr: string, withYear = false): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[wd]} ${d} ${MONTHS[m - 1]}${withYear ? " " + y : ""}`;
}

export function todayIst(): string {
  return istDateStr(Date.now());
}

/** Epoch ms for a wall-clock IST time on a date string. */
export function istTs(dateStr: string, minutes: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0) + minutes * 60_000 - IST_OFFSET * 60_000;
}

export function minutesLabel(minutes: number, ampm = false): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  if (!ampm) return `${pad(h24)}:${pad(m)}`;
  const h = h24 % 12 || 12;
  return `${h}:${pad(m)} ${h24 < 12 ? "AM" : "PM"}`;
}

export function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function parseHHMM(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return NaN;
  return h * 60 + mi;
}

export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
}

export function holidayName(dateStr: string): string | null {
  return NSE_HOLIDAYS[dateStr] || null;
}

export type MarketStatus =
  | "pre-open"
  | "open"
  | "flat-by"
  | "closed"
  | "weekend"
  | "holiday"
  | "replay";

export interface MarketClock {
  status: MarketStatus;
  label: string;
  detail: string;
  allowEntries: boolean;
  minutes: number;
  dateStr: string;
  open: boolean;
  closesIn: number;
  flatIn: number;
}

export function marketClock(nowMs: number, rules: Rules, replay?: { date: string } | null): MarketClock {
  const parts = istParts(nowMs);
  const dateStr = istDateStr(nowMs);
  const minutes = parts.minutes;
  const before = parseHHMM(rules.noEntriesBefore);
  const after = parseHHMM(rules.noEntriesAfter);
  const flat = parseHHMM(rules.flatBy);

  if (replay) {
    const done = minutes >= flat;
    return {
      status: "replay",
      label: done ? "Replay · flat-by" : "Replay",
      detail: `${dateLabel(replay.date, true)} · ${minutesLabel(minutes, true)} IST`,
      allowEntries: minutes >= before && minutes <= after,
      minutes,
      dateStr: replay.date,
      open: true,
      closesIn: CLOSE_MIN - minutes,
      flatIn: flat - minutes,
    };
  }

  if (isWeekend(dateStr)) {
    return {
      status: "weekend",
      label: "Market closed",
      detail: "Weekend · NSE has no session",
      allowEntries: false,
      minutes,
      dateStr,
      open: false,
      closesIn: 0,
      flatIn: 0,
    };
  }
  const hol = holidayName(dateStr);
  if (hol) {
    return {
      status: "holiday",
      label: "Holiday",
      detail: `NSE closed · ${hol}`,
      allowEntries: false,
      minutes,
      dateStr,
      open: false,
      closesIn: 0,
      flatIn: 0,
    };
  }
  if (minutes < OPEN_MIN) {
    return {
      status: "pre-open",
      label: "Pre-open",
      detail: `Opens 09:15 IST · in ${OPEN_MIN - minutes} min`,
      allowEntries: false,
      minutes,
      dateStr,
      open: false,
      closesIn: 0,
      flatIn: 0,
    };
  }
  if (minutes >= CLOSE_MIN) {
    return {
      status: "closed",
      label: "Market closed",
      detail: "Session ended 15:30 IST",
      allowEntries: false,
      minutes,
      dateStr,
      open: false,
      closesIn: 0,
      flatIn: 0,
    };
  }
  const flatNow = minutes >= flat;
  return {
    status: flatNow ? "flat-by" : "open",
    label: flatNow ? "Flat-by" : "Market open",
    detail: flatNow
      ? "No new entries · close open trades"
      : `Closes in ${CLOSE_MIN - minutes} min · flat by ${rules.flatBy}`,
    allowEntries: !flatNow && minutes >= before && minutes <= after,
    minutes,
    dateStr,
    open: true,
    closesIn: CLOSE_MIN - minutes,
    flatIn: flat - minutes,
  };
}

/** Last completed bar at or before `minutes` (bars are stamped at their start). */
export function barsUpTo(bars: Instrument["intraday"], minutes: number) {
  return bars.filter((b) => istParts(b[0]).minutes + BAR_MIN <= minutes);
}

/** The 5-minute slot index of a session bar (0 = 09:15). */
export function barSlot(barStartMinutes: number): number {
  return Math.round((barStartMinutes - OPEN_MIN) / BAR_MIN);
}

export function barStart(ts: number): number {
  return istParts(ts).minutes;
}

export function sessionLabel(sessionDate: string): string {
  return dateLabel(sessionDate, true);
}

export function clockText(nowMs: number): string {
  const d = istDate(nowMs);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
