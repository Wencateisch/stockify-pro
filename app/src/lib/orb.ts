import { BAR_MIN, OPEN_MIN, istParts } from "./time";
import type { Bar, Instrument, OrbHit } from "./types";

export interface OrbComputation {
  hits: OrbHit[];
  watched: OrbHit[];
  scanned: number;
  unusable: number;
  orHigh: number | null;
  orLow: number | null;
  rangeEnd: number;
  cutoff: number;
  bars: number;
  /** Missing 5-minute prints between the open and the last delivered bar. */
  gaps: number;
}

/**
 * Opening-range breakout, transcribed from trader-scanner/orb_hit:
 * range = the first `orMinutes` of 5-minute bars, a hit = the first completed
 * bar after the range that CLOSES above the range high.
 */
export function orbForInstrument(inst: Instrument, orMinutes: number, cutoff: number): OrbComputation | null {
  const nRange = Math.max(1, Math.round(orMinutes / BAR_MIN));
  const rangeEnd = OPEN_MIN + nRange * BAR_MIN;
  const cutoffClamped = Math.min(cutoff, 15 * 60 + 30);

  const bars = inst.intraday
    .map((b) => {
      const p = istParts(b[0] * 1000);
      return { bar: b, start: p.minutes, seconds: p.seconds };
    })
    .filter((b) => b.seconds === 0 && (b.start - OPEN_MIN) % BAR_MIN === 0)
    .filter((b) => b.start >= OPEN_MIN && b.start < 15 * 60 + 30)
    .filter((b) => b.start + BAR_MIN <= cutoffClamped)
    .sort((a, b) => a.start - b.start);

  if (bars.length <= nRange) return null;

  // The opening range itself must be complete. After that, Yahoo's NSE tape
  // routinely drops one print (often 15:20), so the scan uses the bars that
  // exist and reports the hole instead of failing the whole symbol.
  const tape: typeof bars = [];
  for (const item of bars) {
    if (!tape.length || tape[tape.length - 1].start !== item.start) tape.push(item);
  }
  for (let i = 0; i < nRange; i++) {
    if (!tape.some((b) => b.start === OPEN_MIN + i * BAR_MIN)) return null;
  }
  const lastStart = tape[tape.length - 1].start;
  const gaps = Math.max(0, Math.floor((lastStart - OPEN_MIN) / BAR_MIN) + 1 - tape.length);

  const range = tape.slice(0, nRange);
  const orHigh = Math.max(...range.map((b) => b.bar[2]));
  const orLow = Math.min(...range.map((b) => b.bar[3]));

  let hit: OrbHit | null = null;
  for (let i = nRange; i < tape.length; i++) {
    const item = tape[i];
    const close = item.bar[4];
    if (close > orHigh) {
      hit = {
        symbol: inst.symbol,
        price: Math.round(close * 100) / 100,
        barIndex: i,
        barStart: item.start,
        closeAt: item.start + BAR_MIN,
        orHigh: Math.round(orHigh * 100) / 100,
        orLow: Math.round(orLow * 100) / 100,
        pctOver: Math.round((close / orHigh - 1) * 10000) / 100,
        volume: item.bar[5],
        range: Math.round((orHigh - orLow) * 100) / 100,
      };
      break;
    }
  }

  const last = tape[tape.length - 1];
  const watch: OrbHit = {
    symbol: inst.symbol,
    price: Math.round(last.bar[4] * 100) / 100,
    barIndex: tape.length - 1,
    barStart: last.start,
    closeAt: last.start + BAR_MIN,
    orHigh: Math.round(orHigh * 100) / 100,
    orLow: Math.round(orLow * 100) / 100,
    pctOver: Math.round((last.bar[4] / orHigh - 1) * 10000) / 100,
    volume: tape.reduce((a, b) => a + b.bar[5], 0),
    range: Math.round((orHigh - orLow) * 100) / 100,
  };

  return {
    hits: hit ? [hit] : [],
    watched: hit ? [] : [watch],
    scanned: 1,
    unusable: 0,
    orHigh: Math.round(orHigh * 100) / 100,
    orLow: Math.round(orLow * 100) / 100,
    rangeEnd,
    cutoff: cutoffClamped,
    bars: tape.length,
    gaps,
  };
}

export interface OrbScan {
  hits: OrbHit[];
  watched: OrbHit[];
  scanned: number;
  unusable: number;
  rangeEnd: number;
  cutoff: number;
  /** Sessions missing at least one 5-minute print after a complete range. */
  patchy: number;
  gaps: number;
}

export function scanOrb(instruments: Instrument[], orMinutes: number, cutoff: number, minPrice = 0): OrbScan {
  const hits: OrbHit[] = [];
  const watched: OrbHit[] = [];
  let scanned = 0;
  let unusable = 0;
  let patchy = 0;
  let gaps = 0;
  for (const inst of instruments) {
    const r = orbForInstrument(inst, orMinutes, cutoff);
    if (!r) {
      unusable++;
      continue;
    }
    scanned++;
    if (r.gaps > 0) {
      patchy++;
      gaps += r.gaps;
    }
    for (const h of r.hits) if (h.price >= minPrice) hits.push(h);
    for (const w of r.watched) if (w.price >= minPrice) watched.push(w);
  }
  hits.sort((a, b) => a.closeAt - b.closeAt || a.symbol.localeCompare(b.symbol));
  watched.sort((a, b) => b.pctOver - a.pctOver);
  return {
    hits,
    watched,
    scanned,
    unusable,
    rangeEnd: OPEN_MIN + Math.round(orMinutes / BAR_MIN) * BAR_MIN,
    cutoff: Math.min(cutoff, 15 * 60 + 30),
    patchy,
    gaps,
  };
}

export interface LevelHit {
  price: number;
  closeAt: number;
  barIndex: number;
  pctOver: number;
}

/** Entry timer for a daily level: first completed bar to close above it. */
export function levelBreakout(inst: Instrument, level: number, cutoff: number): LevelHit | null {
  const bars = inst.intraday
    .map((b) => ({ bar: b, p: istParts(b[0] * 1000) }))
    .filter((x) => x.p.seconds === 0 && x.p.minutes >= OPEN_MIN && x.p.minutes < 15 * 60 + 30)
    .filter((x) => x.p.minutes + BAR_MIN <= cutoff)
    .sort((a, b) => a.p.minutes - b.p.minutes);
  for (let i = 0; i < bars.length; i++) {
    const x = bars[i];
    if (x.bar[4] > level) {
      return {
        price: Math.round(x.bar[4] * 100) / 100,
        closeAt: x.p.minutes + BAR_MIN,
        barIndex: i,
        pctOver: Math.round((x.bar[4] / level - 1) * 10000) / 100,
      };
    }
  }
  return null;
}

export function cutoffFromClock(minutes: number): number {
  return Math.max(OPEN_MIN + BAR_MIN, Math.min(15 * 60 + 30, Math.floor(minutes / BAR_MIN) * BAR_MIN));
}

export function intradayBarsUpTo(bars: Bar[], cutoff: number): Bar[] {
  return bars.filter((b) => {
    const p = istParts(b[0] * 1000);
    return p.minutes + BAR_MIN <= cutoff;
  });
}
