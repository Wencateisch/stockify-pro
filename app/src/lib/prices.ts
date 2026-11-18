import type { Instrument, MarketData } from "./types";
import type { LiveQuote } from "./data";
import { BAR_MIN, OPEN_MIN, istDateStr, istParts } from "./time";
import type { ReplayState } from "./store";

export interface PricePoint {
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  minutes: number | null;
  source: "snapshot" | "replay" | "live";
  sessionDate: string;
  atLabel: string;
}

function prevCloseBefore(inst: Instrument, date: string): number {
  let prev = inst.quote.prevClose;
  for (const b of inst.daily) {
    if (istDateStr(b[0] * 1000) < date) prev = b[4];
    else break;
  }
  return prev || inst.quote.prevClose;
}

export function priceOf(
  inst: Instrument,
  market: MarketData | null,
  mode: "snapshot" | "replay" | "live",
  replay: ReplayState | null,
  liveQuotes: Record<string, LiveQuote>,
): PricePoint {
  if (mode === "live") {
    const q = liveQuotes[inst.symbol];
    if (q) {
      return {
        price: q.price,
        prevClose: q.prevClose,
        change: q.change,
        changePct: q.changePct,
        high: q.dayHigh,
        low: q.dayLow,
        volume: q.volume,
        minutes: null,
        source: "live",
        sessionDate: new Date().toISOString().slice(0, 10),
        atLabel: "live",
      };
    }
  }

  if (mode === "replay" && replay) {
    const bars = inst.intraday.filter((b) => {
      const p = istParts(b[0] * 1000);
      return p.minutes + BAR_MIN <= replay.minutes;
    });
    const prevClose = prevCloseBefore(inst, replay.date);
    if (!bars.length) {
      return {
        price: prevClose,
        prevClose,
        change: 0,
        changePct: 0,
        high: prevClose,
        low: prevClose,
        volume: 0,
        minutes: OPEN_MIN,
        source: "replay",
        sessionDate: replay.date,
        atLabel: "pre-open",
      };
    }
    const last = bars[bars.length - 1];
    const price = last[4];
    const high = Math.max(...bars.map((b) => b[2]));
    const low = Math.min(...bars.map((b) => b[3]));
    const volume = bars.reduce((a, b) => a + (b[5] || 0), 0);
    const minutes = istParts(last[0] * 1000).minutes + BAR_MIN;
    return {
      price,
      prevClose,
      change: price - prevClose,
      changePct: ((price - prevClose) / prevClose) * 100,
      high,
      low,
      volume,
      minutes,
      source: "replay",
      sessionDate: replay.date,
      atLabel: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(
        2,
        "0",
      )}`,
    };
  }

  const q = inst.quote;
  return {
    price: q.price,
    prevClose: q.prevClose,
    change: q.change,
    changePct: q.changePct,
    high: q.dayHigh,
    low: q.dayLow,
    volume: q.volume,
    minutes: null,
    source: "snapshot",
    sessionDate: market?.session.date || "",
    atLabel: "snapshot",
  };
}

export function intradaySessionDate(inst: Instrument): string {
  return inst.intraday.length ? istDateStr(inst.intraday[0][0] * 1000) : "";
}
