import type { Instrument, MarketData, SetupHit } from "./types";
import { BAR_MIN, OPEN_MIN, istDateStr, istParts } from "./time";
import { breadthOf } from "./data";

export interface ProxyPoint {
  minutes: number;
  pct: number;
  level: number;
}

export interface IntradayProxy {
  points: ProxyPoint[];
  lastPct: number;
  level: number;
  prevClose: number;
  high: number;
  low: number;
  date: string;
  symbols: number;
}

/**
 * The close of the last daily bar strictly *before* `date`.
 *
 * `quote.prevClose` is the previous close of the newest session in the
 * snapshot, which is not the base for an older intraday tape. Using it anyway
 * silently divides yesterday's bars by today's close.
 */
function closeBefore(inst: Instrument, date: string): number | null {
  for (let i = inst.daily.length - 1; i >= 0; i--) {
    if (istDateStr(inst.daily[i][0] * 1000) < date) return inst.daily[i][4];
  }
  return null;
}

/** The single intraday session every bundled tape shares, e.g. "2026-11-16". */
export function intradayTapeDate(market: MarketData | null): string {
  if (!market) return "";
  for (const inst of market.symbols) {
    if (inst.intraday.length) return istDateStr(inst.intraday[0][0] * 1000);
  }
  return market.session.date;
}

/**
 * Equal-weight Nifty 50 proxy from the real constituents: every symbol's
 * percentage move from its previous close, averaged per 5-minute slot. It is
 * explicitly a proxy, not the NIFTY 50 index (which the free snapshot has no
 * licence to redistribute).
 */
export function intradayProxy(market: MarketData | null): IntradayProxy {
  const empty: IntradayProxy = {
    points: [],
    lastPct: 0,
    level: 10000,
    prevClose: 10000,
    high: 10000,
    low: 10000,
    date: market?.session.date || "",
    symbols: 0,
  };
  if (!market) return empty;

  const tapeDate = intradayTapeDate(market);
  const bySlot = new Map<number, { sum: number; n: number }>();
  for (const inst of market.symbols) {
    if (!inst.intraday.length) continue;
    // Never mix two sessions into one average.
    if (istDateStr(inst.intraday[0][0] * 1000) !== tapeDate) continue;
    const prev = closeBefore(inst, tapeDate) ?? (inst.quote.prevClose > 0 ? inst.quote.prevClose : inst.intraday[0][1]);
    if (!(prev > 0)) continue;
    for (const b of inst.intraday) {
      const p = istParts(b[0] * 1000);
      if (p.seconds !== 0) continue;
      if (p.minutes < OPEN_MIN) continue;
      const slot = Math.round((p.minutes - OPEN_MIN) / BAR_MIN);
      const cell = bySlot.get(slot) || { sum: 0, n: 0 };
      cell.sum += (b[4] / prev - 1) * 100;
      cell.n += 1;
      bySlot.set(slot, cell);
    }
  }
  if (!bySlot.size) return { ...empty, date: tapeDate || empty.date };

  const points = [...bySlot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, cell]) => {
      const pct = cell.sum / cell.n;
      return { minutes: OPEN_MIN + slot * BAR_MIN, pct, level: 10000 * (1 + pct / 100) };
    });
  const pcts = points.map((p) => p.pct);
  const lastPct = pcts[pcts.length - 1];
  return {
    points,
    lastPct,
    level: 10000 * (1 + lastPct / 100),
    prevClose: 10000,
    high: 10000 * (1 + Math.max(...pcts) / 100),
    low: 10000 * (1 + Math.min(...pcts) / 100),
    date: tapeDate,
    symbols: market.symbols.length,
  };
}

/**
 * Breadth for the session the desk is charting, not for whatever session the
 * quotes belong to. Advances are the names whose last print of that tape closed
 * above the previous session's close; turnover is that session's traded value.
 */
export function tapeBreadth(market: MarketData | null): {
  up: number;
  down: number;
  flat: number;
  avgPct: number;
  turnover: number;
  count: number;
  date: string;
} {
  if (!market) return { up: 0, down: 0, flat: 0, avgPct: 0, turnover: 0, count: 0, date: "" };
  const tapeDate = intradayTapeDate(market);
  let up = 0;
  let down = 0;
  let flat = 0;
  let sumPct = 0;
  let turnover = 0;
  let count = 0;
  for (const inst of market.symbols) {
    if (!inst.intraday.length) continue;
    if (istDateStr(inst.intraday[0][0] * 1000) !== tapeDate) continue;
    const prev = closeBefore(inst, tapeDate);
    if (!prev || !(prev > 0)) continue;
    const last = inst.intraday[inst.intraday.length - 1];
    const pct = (last[4] / prev - 1) * 100;
    sumPct += pct;
    count += 1;
    if (pct > 0.0001) up += 1;
    else if (pct < -0.0001) down += 1;
    else flat += 1;
    turnover += inst.intraday.reduce((a, b) => a + b[4] * (b[5] || 0), 0);
  }
  return { up, down, flat, avgPct: count ? sumPct / count : 0, turnover, count, date: tapeDate };
}

export function marketBreadth(market: MarketData | null) {
  if (!market) return { up: 0, down: 0, flat: 0, avgPct: 0, turnover: 0, count: 0 };
  return breadthOf(market);
}

export function movers(market: MarketData | null, direction: "up" | "down", limit = 5): Instrument[] {
  if (!market) return [];
  const list = market.symbols.slice().sort((a, b) => {
    return direction === "up" ? b.quote.changePct - a.quote.changePct : a.quote.changePct - b.quote.changePct;
  });
  return list.slice(0, limit);
}

export function sparkValues(inst: Instrument | null, n = 30): number[] {
  if (!inst || !inst.daily.length) return [];
  return inst.daily.slice(-n).map((b) => b[4]);
}

export function intradayPoints(inst: Instrument | null): { minutes: number; value: number }[] {
  if (!inst) return [];
  return inst.intraday
    .map((b) => {
      const p = istParts(b[0] * 1000);
      return { minutes: p.minutes, value: b[4] };
    })
    .filter((p) => p.minutes >= OPEN_MIN);
}

export interface SessionStats {
  advancers: number;
  decliners: number;
  unchanged: number;
  turnover: number;
  avgPct: number;
}

export function sessionStats(market: MarketData | null): SessionStats {
  const b = marketBreadth(market);
  return {
    advancers: b.up,
    decliners: b.down,
    unchanged: b.flat,
    turnover: b.turnover,
    avgPct: b.avgPct,
  };
}

export function hitScore(hit: SetupHit): number {
  return hit.setups.length * 2 + (hit.rsi !== null && hit.rsi < 45 ? 1 : 0);
}

export function initials(symbol: string): string {
  const clean = symbol.replace(/[^A-Z0-9]/gi, "");
  return clean.slice(0, 3);
}

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const p = istParts(d.getTime());
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${p.day} ${months[p.m]} ${p.y} · ${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(
    p.minutes % 60,
  ).padStart(2, "0")} IST`;
}
