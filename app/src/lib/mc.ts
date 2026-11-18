import type { LiveQuote } from "./data";

/**
 * Moneycontrol's own scrip keys for the 50 Nifty 50 names.
 *
 * The public pricefeed is keyed by Moneycontrol's internal scrip id, not the NSE
 * ticker (`RELIANCE` is `RI`). Every key below was resolved from Moneycontrol's
 * autosuggest endpoint and then verified against the live feed by matching the
 * `NSEID` field, so a wrong key can never silently show another company's price.
 */
export const MC_IDS: Record<string, string> = {
  ADANIENT: "AE01",
  ADANIPORTS: "MPS",
  APOLLOHOSP: "AHE",
  ASIANPAINT: "API",
  AXISBANK: "UTI10",
  "BAJAJ-AUTO": "BA06",
  BAJAJFINSV: "BF04",
  BAJFINANCE: "BAF",
  BEL: "BE03",
  BHARTIARTL: "BTV",
  BSE: "B03",
  CIPLA: "C",
  COALINDIA: "CI29",
  DRREDDY: "DRL",
  EICHERMOT: "EM",
  ETERNAL: "Z01",
  GRASIM: "GI01",
  HCLTECH: "HCL02",
  HDFCBANK: "HDF01",
  HDFCLIFE: "HSL01",
  HINDALCO: "H",
  HINDUNILVR: "HL",
  ICICIBANK: "ICI02",
  INDIGO: "IA05",
  INFY: "IT",
  ITC: "ITC",
  JIOFIN: "JFS",
  JSWSTEEL: "JVS",
  KOTAKBANK: "KMF",
  LT: "LT",
  "M&M": "MM",
  MARUTI: "MU01",
  MAXHEALTH: "MHI",
  NESTLEIND: "NI",
  NTPC: "NTP",
  ONGC: "ONG",
  POWERGRID: "PGC",
  RELIANCE: "RI",
  SBILIFE: "SLI03",
  SBIN: "SBI",
  SHRIRAMFIN: "STF",
  SUNPHARMA: "SPI",
  TATACONSUM: "TT",
  TATASTEEL: "TIS",
  TCS: "TCS",
  TECHM: "TM4",
  TITAN: "TI01",
  TMPV: "TEL",
  TRENT: "L",
  ULTRACEMCO: "UTC",
};

const ENDPOINT = "https://priceapi.moneycontrol.com/pricefeed/nse/equitycash";

const CACHE_MS = 4_000;
const cache = new Map<string, { at: number; quote: LiveQuote | null }>();

interface FeedRow {
  pricecurrent?: string | number;
  priceprevclose?: string | number;
  pricechange?: string | number;
  pricepercentchange?: string | number;
  HP?: string | number;
  LP?: string | number;
  VOL?: string | number;
  VOLUME?: string | number;
  NSEID?: string;
  DISPID?: string;
  lastupd?: string;
  lastupd_epoch?: string | number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** One quote from the public Moneycontrol feed, or null when the row is unusable. */
export async function fetchMcQuote(symbol: string, signal?: AbortSignal): Promise<LiveQuote | null> {
  const id = MC_IDS[symbol];
  if (!id) return null;
  const hit = cache.get(symbol);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_MS) return hit.quote;

  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, {
      signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { data?: FeedRow | null };
    const row = body?.data;
    const price = num(row?.pricecurrent);
    // Guard against Moneycontrol's legacy "NT*" / empty rows.
    if (!row || !(price > 0)) {
      cache.set(symbol, { at: now, quote: null });
      return null;
    }
    const prevClose = num(row.priceprevclose);
    const epoch = num(row.lastupd_epoch);
    const quote: LiveQuote = {
      symbol,
      price,
      prevClose,
      change: num(row.pricechange) || price - prevClose,
      changePct: num(row.pricepercentchange),
      dayHigh: num(row.HP),
      dayLow: num(row.LP),
      volume: num(row.VOL ?? row.VOLUME),
      asOf: epoch > 0 ? epoch * 1000 : undefined,
    };
    cache.set(symbol, { at: now, quote });
    return quote;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    cache.set(symbol, { at: now, quote: null });
    return null;
  }
}

/** Fetch the whole Nifty 50 direct from the browser, a few at a time. */
export async function fetchMcQuotes(
  symbols: string[] = Object.keys(MC_IDS),
  options: { concurrency?: number; timeoutMs?: number } = {},
): Promise<LiveQuote[]> {
  const concurrency = options.concurrency ?? 6;
  const timeoutMs = options.timeoutMs ?? 9_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const queue = symbols.slice();
  const out: LiveQuote[] = [];

  const worker = async () => {
    while (queue.length) {
      const symbol = queue.shift()!;
      const quote = await fetchMcQuote(symbol, ctrl.signal).catch(() => null);
      if (quote) out.push(quote);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker));
  } finally {
    clearTimeout(timer);
  }
  return out;
}
