import { BAR_MIN, OPEN_MIN, SESSION_BARS, istDateStr, istParts } from "./time";
import type { Bar, TMInput, TMOutput, TMTrade } from "./types";

const SAMPLE_PATHS = 160;
const BAND_PATHS = 1000;
const BAND_Q = [0.05, 0.25, 0.5, 0.75, 0.95];
const HIST_BINS = 24;
const MIN_SESSIONS = 20;
const COIN_FLIP = 0.05;
const STRONG = 0.15;
const MANY_NEITHER = 0.4;

export class TMError extends Error {}

interface SessionBar {
  slot: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Session {
  date: string;
  bars: SessionBar[];
  bySlot: Map<number, SessionBar>;
}

/** Deterministic PRNG (mulberry32): the same seed always gives the same reel. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRand(seed: number) {
  const r = mulberry32(seed);
  return {
    int(min: number, max: number) {
      return min + Math.floor(r() * (max - min + 1));
    },
    pick<T>(arr: T[]): T {
      return arr[Math.floor(r() * arr.length)];
    },
  };
}

/** Split the 5-minute history into IST sessions keyed by YYYY-MM-DD. */
export function splitSessions(bars: Bar[]): Map<string, Map<number, SessionBar>> {
  const days = new Map<string, Map<number, SessionBar>>();
  for (const b of bars) {
    const [ts, o, h, l, c, v] = b;
    const parts = istParts(ts * 1000);
    if (parts.seconds !== 0) continue;
    if (parts.minutes < OPEN_MIN || parts.minutes >= OPEN_MIN + SESSION_BARS * BAR_MIN) continue;
    const slot = Math.round((parts.minutes - OPEN_MIN) / BAR_MIN);
    if (slot < 0 || slot >= SESSION_BARS) continue;
    const date = istDateStr(ts * 1000);
    let day = days.get(date);
    if (!day) {
      day = new Map();
      days.set(date, day);
    }
    day.set(slot, { slot, o, h, l, c, v });
  }
  return days;
}

function sessionOk(day: Map<number, SessionBar>): boolean {
  // Yahoo's NSE 5-minute series runs 09:15 → 15:20 and occasionally drops an
  // edge bar. A usable session opens at 09:15 and still trades at 15:15.
  return day.size >= 70 && day.has(0) && day.has(1) && day.has(2) && day.has(71);
}

function toSessions(days: Map<string, Map<number, SessionBar>>): { full: Session[]; short: number } {
  const full: Session[] = [];
  let short = 0;
  for (const date of [...days.keys()].sort()) {
    const map = days.get(date)!;
    if (!sessionOk(map)) {
      short++;
      continue;
    }
    full.push({ date, bars: [...map.values()].sort((a, b) => a.slot - b.slot), bySlot: map });
  }
  return { full, short };
}

function buildPool(sessions: Session[]) {
  const pool: SessionBar[][] = Array.from({ length: SESSION_BARS }, () => []);
  for (const { bySlot } of sessions) {
    for (let i = 1; i < SESSION_BARS; i++) {
      const b = bySlot.get(i);
      const prev = bySlot.get(i - 1);
      if (!b || !prev || prev.c <= 0) continue;
      const pc = prev.c;
      pool[i].push({ slot: i, o: b.o / pc, h: b.h / pc, l: b.l / pc, c: b.c / pc, v: 0 });
    }
  }
  for (let i = 1; i < SESSION_BARS; i++) {
    if (pool[i].length) continue;
    for (let d = 1; d < SESSION_BARS; d++) {
      if (pool[i - d]?.length) {
        pool[i] = pool[i - d];
        break;
      }
      if (pool[i + d]?.length) {
        pool[i] = pool[i + d];
        break;
      }
    }
  }
  return pool;
}

function pct(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

export function runTimeMachine(input: TMInput): TMOutput {
  if (!(input.replays >= 1 && input.replays <= 1_000_000)) throw new TMError("Replays must be between 1 and 1,000,000.");
  if (!(input.stop < input.entry && input.entry < input.target)) {
    throw new TMError("A buy needs stop < entry < target.");
  }

  const days = splitSessions(input.bars);
  const all = toSessions(days);
  const sessions = all.full.filter((s) => s.date < input.date);
  if (sessions.length < MIN_SESSIONS) {
    throw new TMError(
      `Only ${sessions.length} usable session${sessions.length === 1 ? "" : "s"} of 5-minute bars before ${
        input.date
      }. The Time Machine needs at least ${MIN_SESSIONS}.`,
    );
  }

  const k = Math.round((input.entryMinutes - OPEN_MIN) / BAR_MIN) - 1;
  if (!(k >= 0 && k <= SESSION_BARS - 2)) {
    throw new TMError(`The entry has to close between 09:20 and 15:25 to leave bars to replay (got ${input.entryTimeLabel}).`);
  }
  const last = Math.round((input.untilMinutes - OPEN_MIN) / BAR_MIN) - 1;
  if (last <= k) {
    throw new TMError(
      `Flat-by ${fmtClock(input.untilMinutes)} leaves nothing to replay after the ${input.entryTimeLabel} entry.`,
    );
  }

  const entryDay = days.get(input.date);
  if (!entryDay || !entryDay.has(k)) {
    throw new TMError(`No complete 5-minute bar closing at ${input.entryTimeLabel} on ${input.date} in the history.`);
  }

  const pool = buildPool(sessions);
  const sim = simulate(pool, input, k, last);
  const history = historyReplay(sessions, input, last);

  const rAtTarget = round4((input.target - input.entry) / input.risk);
  const pTarget = round4(sim.target / input.replays);
  const pStop = round4(sim.stop / input.replays);
  const pNeither = round4(sim.close / input.replays);
  const lean = pTarget + pStop > 0 ? pTarget / (pTarget + pStop) - 1 / (1 + rAtTarget) : null;
  const verdict = makeVerdict({ pTarget, pStop, avgR: sim.avgR, rAtTarget, lean, until: input.untilMinutes });

  const warnings: string[] = [];
  const entryBar = entryDay.get(k)!;
  if (input.entry < entryBar.l - 0.01 || input.entry > entryBar.h + 0.01) {
    warnings.push(
      `The plan's entry ₹${input.entry.toFixed(2)} is outside that bar's range ₹${entryBar.l.toFixed(2)} to ₹${entryBar.h.toFixed(2)}.`,
    );
  }

  return {
    replays: input.replays,
    seed: input.seed,
    window: 2,
    barsLeft: last - k,
    pTarget,
    pStop,
    pNeither,
    pGreen: round4(sim.green / input.replays),
    medianClose: round2(pct(sim.sortedCloses, 0.5)),
    p5Close: round2(pct(sim.sortedCloses, 0.05)),
    p95Close: round2(pct(sim.sortedCloses, 0.95)),
    avgR: Math.round(sim.avgR * 1000) / 1000,
    rAtTarget,
    bands: sim.bands,
    bandTimes: Array.from({ length: last - k + 1 }, (_, j) => OPEN_MIN + BAR_MIN * (k + 1 + j)),
    samplePaths: sim.paths,
    hist: sim.hist,
    poolSessions: sessions.length,
    poolFrom: sessions[0].date,
    poolTo: sessions[sessions.length - 1].date,
    until: input.untilMinutes,
    history,
    verdict,
    notes: makeNotes({ pNeither, avgR: sim.avgR, lean, until: input.untilMinutes }),
    warnings,
    shortSessions: all.short,
  };
}

function simulate(pool: SessionBar[][], input: TMInput, k: number, last: number) {
  const replays = input.replays;
  const entry = input.entry;
  const stop = input.stop;
  const target = input.target;
  const rand = makeRand(input.seed);
  const slot = (i: number) => Math.min(SESSION_BARS - 1, Math.max(1, i + rand.int(-2, 2)));

  let targetCount = 0;
  let stopCount = 0;
  let closeCount = 0;
  let green = 0;
  const closes: number[] = new Array(replays);
  const Rs: number[] = new Array(replays);
  const paths: number[][] = [];
  const rAtTarget = (target - entry) / (entry - stop);

  for (let n = 0; n < replays; n++) {
    let p = entry;
    let outcome: "target" | "stop" | null = null;
    const keep = n < SAMPLE_PATHS;
    const path: number[] = keep ? [entry] : [];
    for (let i = k + 1; i <= last; i++) {
      const bar = rand.pick(pool[slot(i)]);
      const hi = p * bar.h;
      const lo = p * bar.l;
      if (outcome === null) {
        if (lo <= stop) outcome = "stop"; // stop first: the conservative call
        else if (hi >= target) outcome = "target";
      }
      p = p * bar.c;
      if (keep) path.push(round2(p));
    }
    if (outcome === "target") targetCount++;
    else if (outcome === "stop") stopCount++;
    else closeCount++;
    closes[n] = p;
    Rs[n] = outcome === "target" ? rAtTarget : outcome === "stop" ? -1 : (p - entry) / (entry - stop);
    if (outcome === "target" || (outcome === null && p > entry)) green++;
    if (keep) paths.push(path);
  }

  const sortedCloses = closes.slice().sort((a, b) => a - b);
  const lo1 = pct(sortedCloses, 0.01);
  const hi99 = pct(sortedCloses, 0.99);
  const width = (hi99 - lo1) / HIST_BINS;
  const bins = new Array(HIST_BINS).fill(0);
  for (const c of sortedCloses) {
    const b = width > 0 ? Math.floor((c - lo1) / width) : 0;
    if (b >= 0 && b < HIST_BINS) bins[b]++;
  }

  // A second pass of 1,000 paths, same seed, for the percentile fan.
  const rand2 = makeRand(input.seed);
  const slot2 = (i: number) => Math.min(SESSION_BARS - 1, Math.max(1, i + rand2.int(-2, 2)));
  const allPaths: number[][] = [];
  for (let n = 0; n < BAND_PATHS; n++) {
    let p = entry;
    const path = [entry];
    for (let i = k + 1; i <= last; i++) {
      p *= rand2.pick(pool[slot2(i)]).c;
      path.push(p);
    }
    allPaths.push(path);
  }
  const bands: number[][] = [];
  for (let j = 0; j <= last - k; j++) {
    const col = allPaths.map((p) => p[j]).sort((a, b) => a - b);
    bands.push(BAND_Q.map((q) => round2(pct(col, q))));
  }

  return {
    target: targetCount,
    stop: stopCount,
    close: closeCount,
    green,
    avgR: Rs.reduce((a, b) => a + b, 0) / Rs.length,
    sortedCloses,
    paths,
    bands,
    hist: { lo: round2(lo1), hi: round2(hi99), bins },
  };
}

function historyReplay(sessions: Session[], input: TMInput, last: number): TMOutput["history"] {
  const nRange = Math.max(1, Math.round(input.orMinutes / BAR_MIN));
  const trades: TMTrade[] = [];
  const useOrMid = input.stopRule === "or-mid";
  const useOrLow = input.stopRule === "or-low";
  const stopPct = (input.risk / input.entry) * 100;

  for (const { date, bySlot, bars } of sessions) {
    const range: SessionBar[] = [];
    let complete = true;
    for (let i = 0; i < nRange; i++) {
      const b = bySlot.get(i);
      if (!b) {
        complete = false;
        break;
      }
      range.push(b);
    }
    if (!complete) continue;

    const oh = Math.max(...range.map((b) => b.h));
    const ol = Math.min(...range.map((b) => b.l));
    let trigger: SessionBar | null = null;
    for (let i = nRange; i <= last; i++) {
      const b = bySlot.get(i);
      if (b && b.c > oh) {
        trigger = b;
        break;
      }
    }
    if (!trigger) continue;

    const e = round2(trigger.c);
    const s = useOrMid ? floorTick((oh + ol) / 2) : useOrLow ? floorTick(ol) : floorTick(e * (1 - stopPct / 100));
    const risk = e - s;
    if (risk <= 0) continue;
    const t = round2(e + input.targetR * risk);
    let outcome: "target" | "stop" | "close" = "close";
    for (let i = trigger.slot + 1; i <= last; i++) {
      const b = bySlot.get(i);
      if (!b) continue;
      if (b.l <= s) {
        outcome = "stop";
        break;
      }
      if (b.h >= t) {
        outcome = "target";
        break;
      }
    }
    const lastBar = bySlot.get(last) || bars[bars.length - 1];
    const r = outcome === "target" ? (t - e) / risk : outcome === "stop" ? -1 : (lastBar.c - e) / risk;
    trades.push({
      date,
      time: fmtClock(OPEN_MIN + BAR_MIN * (trigger.slot + 1)),
      entry: e,
      stop: s,
      target: t,
      outcome,
      r: Math.round(r * 100) / 100,
    });
  }

  return {
    sessions: sessions.length,
    triggered: trades.length,
    target: trades.filter((t) => t.outcome === "target").length,
    stop: trades.filter((t) => t.outcome === "stop").length,
    close: trades.filter((t) => t.outcome === "close").length,
    green: trades.filter((t) => t.r > 0).length,
    avgR: trades.length ? Math.round((trades.reduce((a, t) => a + t.r, 0) / trades.length) * 1000) / 1000 : null,
    trades,
  };
}

function makeVerdict(opts: {
  pTarget: number;
  pStop: number;
  avgR: number;
  rAtTarget: number;
  lean: number | null;
  until: number;
}): string {
  const until = fmtClock(opts.until);
  if (opts.lean === null) {
    return `No replay reached the target or the stop by ${until}: the price at ${until} decides every one.`;
  }
  const d = opts.lean;
  const oneR = Math.abs(opts.rAtTarget - 1) < 0.005;
  let head: string;
  if (Math.abs(d) < COIN_FLIP) head = oneR ? "Close to a coin flip" : "Close to break-even";
  else if (Math.abs(d) < STRONG) head = d > 0 ? "Leans toward the target" : "Leans toward the stop";
  else head = d > 0 ? "Strongly toward the target" : "Strongly toward the stop";

  const odds = `target first ${(100 * opts.pTarget).toFixed(1)}% vs stop first ${(100 * opts.pStop).toFixed(1)}%`;
  if (oneR) return `${head}: ${odds}.`;
  const share = opts.pTarget / (opts.pTarget + opts.pStop);
  const even = 1 / (1 + opts.rAtTarget);
  return `${head}: at ${+opts.rAtTarget.toFixed(2)}R the target has to come first in ${(100 * even).toFixed(
    0,
  )}% of the replays that hit one side; it did in ${(100 * share).toFixed(0)}% (${odds}).`;
}

function makeNotes(opts: { pNeither: number; avgR: number; lean: number | null; until: number }): string[] {
  const notes: string[] = [];
  if (opts.pNeither > MANY_NEITHER && opts.lean !== null) {
    notes.push(
      `${(100 * opts.pNeither).toFixed(1)}% of the replays hit neither by ${fmtClock(
        opts.until,
      )}; the price at ${fmtClock(opts.until)} decides those.`,
    );
  }
  if (opts.lean !== null && Math.abs(opts.lean) >= COIN_FLIP && opts.avgR !== 0 && opts.avgR > 0 !== opts.lean > 0) {
    notes.push(
      `Average R is ${opts.avgR > 0 ? "+" : ""}${opts.avgR.toFixed(3)} even so: the replays that hit neither pull it the other way.`,
    );
  }
  return notes;
}

function floorTick(x: number): number {
  return Math.floor((x + 1e-9) / 0.05) * 0.05;
}

function round2(x: number): number {
  return Math.round((x + 1e-9) * 100) / 100;
}

function round4(x: number): number {
  return Math.round((x + 1e-9) * 10000) / 10000;
}

export function fmtClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
