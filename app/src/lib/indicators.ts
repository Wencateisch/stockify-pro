import type { Bar, Instrument, SetupHit, SetupKey, SetupNumbers } from "./types";

export function closesOf(bars: Bar[]): number[] {
  return bars.map((b) => b[4]);
}

export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

export function smaSeries(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Wilder's RSI, the same math as the Day Trader scanner. */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length < n + 1) return null;
  let ag = 0;
  let al = 0;
  for (let i = 1; i <= n; i++) {
    const ch = closes[i] - closes[i - 1];
    ag += Math.max(0, ch);
    al += Math.max(0, -ch);
  }
  ag /= n;
  al /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(0, ch)) / n;
    al = (al * (n - 1) + Math.max(0, -ch)) / n;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export function atr(bars: Bar[], n = 14): { value: number; bars: number } {
  const trs: number[] = [];
  let prev: number | null = null;
  for (const b of bars) {
    let tr = b[2] - b[3];
    if (prev !== null) tr = Math.max(tr, Math.abs(b[2] - prev), Math.abs(b[3] - prev));
    trs.push(tr);
    prev = b[4];
  }
  const use = trs.slice(-n);
  if (!use.length) return { value: 0, bars: 0 };
  return { value: use.reduce((a, b) => a + b, 0) / use.length, bars: use.length };
}

/**
 * The five daily setups, transcribed from trader-scanner/find_setups:
 *  breakout_20d    last close above every close of the 20 before it
 *  bull_flag       >10% over the 10 sessions before the last 5, last 5 inside 5%
 *  reclaim_ma20    prior close below the 20-day average, latest above it
 *  oversold        Wilder RSI(14) under 30
 *  oversold_bounce RSI was under 30 yesterday, today closed up
 */
export function findSetups(closes: number[]) {
  const c = closes;
  const last = c[c.length - 1];
  const hi20 = Math.max(...c.slice(-21, -1));
  const ma20 = c.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ma20Prev = c.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const run = c[c.length - 6] / c[c.length - 16] - 1;
  const rng5 = (Math.max(...c.slice(-5)) - Math.min(...c.slice(-5))) / last;
  const r = rsi(c);
  const rPrev = rsi(c.slice(0, -1));
  const tags: SetupKey[] = [];
  if (last > hi20) tags.push("breakout_20d");
  if (run > 0.1 && rng5 < 0.05) tags.push("bull_flag");
  if (c[c.length - 2] < ma20Prev && last > ma20) tags.push("reclaim_ma20");
  if (r !== null && r < 30) tags.push("oversold");
  if (rPrev !== null && rPrev < 30 && last > c[c.length - 2]) tags.push("oversold_bounce");
  const a = atr([], 14);
  const numbers: SetupNumbers = {
    rsi: r,
    rsiPrev: rPrev,
    high20: hi20,
    ma20,
    runPct: run * 100,
    range5Pct: rng5 * 100,
    atr: a.value,
    level: hi20,
  };
  return { tags, numbers };
}

export const SETUP_LABELS: Record<SetupKey, string> = {
  breakout_20d: "20d breakout",
  bull_flag: "Bull flag",
  reclaim_ma20: "MA20 reclaim",
  oversold: "Oversold",
  oversold_bounce: "Oversold bounce",
  orb: "Opening range",
};

export const SETUP_ORDER: SetupKey[] = [
  "breakout_20d",
  "bull_flag",
  "reclaim_ma20",
  "oversold",
  "oversold_bounce",
];

export const SETUP_DESCRIPTIONS: Record<SetupKey, string> = {
  breakout_20d: "Last close above every one of the previous 20 closes.",
  bull_flag: "More than 10% up over 10 sessions, then the last 5 closes held inside a 5% range.",
  reclaim_ma20: "Closed below the 20-day average yesterday, back above it today.",
  oversold: "Wilder RSI(14) under 30 — stretched to the downside.",
  oversold_bounce: "RSI was under 30 yesterday and today closed higher.",
  orb: "The first completed 5-minute bar to close above the opening range high.",
};

/** Daily scan over the Nifty 50 snapshot. Dynamic filters; no data invented. */
export function scanDaily(instruments: Instrument[], minPrice = 0, minVolume = 0): SetupHit[] {
  const hits: SetupHit[] = [];
  for (const inst of instruments) {
    const bars = inst.daily;
    if (!bars || bars.length < 30) continue;
    const closes = closesOf(bars);
    const last = closes[closes.length - 1];
    if (last < minPrice) continue;
    if (minVolume > 0 && (inst.quote.volume || 0) < minVolume) continue;
    const { tags, numbers } = findSetups(closes);
    if (!tags.length) continue;
    const dailyAtr = atr(bars, 14);
    const levelBySetup: Record<SetupKey, number> = {
      breakout_20d: numbers.high20,
      bull_flag: Math.max(...closes.slice(-5)),
      reclaim_ma20: numbers.ma20,
      oversold: Math.max(...bars.slice(-3).map((b) => b[2])),
      oversold_bounce: Math.max(...bars.slice(-3).map((b) => b[2])),
      orb: numbers.high20,
    };
    const level = Math.max(...tags.map((t) => levelBySetup[t]));
    const closeDate = isoDateOf(bars[bars.length - 1][0]);
    hits.push({
      symbol: inst.symbol,
      setups: tags,
      price: last,
      changePct: inst.quote.changePct,
      volume: inst.quote.volume,
      rsi: numbers.rsi === null ? null : Math.round(numbers.rsi * 10) / 10,
      numbers: { ...numbers, atr: dailyAtr.value, level },
      closeDate,
    });
  }
  hits.sort((a, b) => b.price * (b.volume || 0) - a.price * (a.volume || 0) || a.symbol.localeCompare(b.symbol));
  return hits;
}

function isoDateOf(ts: number): string {
  const d = new Date(ts * 1000 + 5.5 * 3600 * 1000);
  const p = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function daysAgoLabel(dateStr: string): string {
  const d = isoDateOf(Date.now() / 1000);
  if (dateStr === d) return "today";
  return dateStr;
}
