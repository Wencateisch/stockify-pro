export interface TMSeed {
  symbol: string;
  entry: number;
  stop: number;
  target: number;
  entryMinutes: number;
  entryTimeLabel: string;
  orMinutes: number;
  orHigh: number;
  orLow: number;
  stopRule: string;
  risk: number;
  targetR: number;
}

const KEY = "stockify-tm-seed";

/** Hand-off from the symbol plan to the Time Machine. Not persisted state. */
let seed: TMSeed | null = null;

export function setTMSeed(next: TMSeed) {
  seed = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function getTMSeed(symbol?: string): TMSeed | null {
  if (!seed) {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) seed = JSON.parse(raw) as TMSeed;
    } catch {
      seed = null;
    }
  }
  if (!seed) return null;
  if (symbol && seed.symbol !== symbol.toUpperCase()) return null;
  return seed;
}
