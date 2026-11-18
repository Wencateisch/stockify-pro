import type { Bar, HistoryDoc, Instrument, MarketData } from "./types";
import { istDateStr, istParts } from "./time";

const BASE = import.meta.env.BASE_URL || "./";

let marketPromise: Promise<MarketData> | null = null;
const historyCache = new Map<string, Promise<HistoryDoc>>();

export class DataError extends Error {}

export function intradayDateOf(inst: Instrument): string | null {
  return inst.intraday.length ? istDateStr(inst.intraday[0][0]) : null;
}

/** Daily bars with the in-progress session removed, exactly like the scanner. */
export function completeDailyBars(inst: Instrument, market: MarketData): Bar[] {
  const bars = inst.daily.slice();
  if (!bars.length) return bars;
  const lastDate = istDateStr(bars[bars.length - 1][0]);
  const generated = new Date(market.generatedAt);
  const genParts = istParts(generated.getTime());
  const generatedAfterClose = genParts.minutes >= 15 * 60 + 30;
  if (lastDate === market.session.date && !generatedAfterClose) {
    bars.pop();
  }
  return bars;
}

export async function loadMarket(): Promise<MarketData> {
  if (!marketPromise) {
    marketPromise = (async () => {
      const res = await fetch(`${BASE}data/market.json`, { cache: "no-cache" });
      if (!res.ok) throw new DataError(`Market snapshot: HTTP ${res.status}`);
      const data = (await res.json()) as MarketData;
      if (!data || !Array.isArray(data.symbols) || !data.symbols.length) {
        throw new DataError("Market snapshot has no symbols");
      }
      data.symbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
      return data;
    })().catch((err) => {
      marketPromise = null;
      throw err;
    });
  }
  return marketPromise;
}

export async function loadHistory(symbol: string): Promise<HistoryDoc> {
  let p = historyCache.get(symbol);
  if (!p) {
    p = (async () => {
      const res = await fetch(`${BASE}data/history/${encodeURIComponent(symbol)}.json`, { cache: "force-cache" });
      if (!res.ok) throw new DataError(`No 5-minute history for ${symbol} (HTTP ${res.status})`);
      const doc = (await res.json()) as HistoryDoc;
      if (!doc || !Array.isArray(doc.bars)) throw new DataError(`History for ${symbol} is malformed`);
      return doc;
    })().catch((err) => {
      historyCache.delete(symbol);
      throw err;
    });
    historyCache.set(symbol, p);
  }
  return p;
}

export function instrumentBySymbol(market: MarketData | null, symbol: string): Instrument | null {
  if (!market) return null;
  return market.symbols.find((s) => s.symbol === symbol) || null;
}

/** Equal-weight Nifty 50 proxy from the real constituents (clearly labelled in the UI). */
export function breadthOf(market: MarketData) {
  let up = 0;
  let down = 0;
  let flat = 0;
  let sum = 0;
  let turnover = 0;
  for (const s of market.symbols) {
    const c = s.quote.changePct;
    if (c > 0.02) up++;
    else if (c < -0.02) down++;
    else flat++;
    sum += c;
    turnover += s.quote.price * (s.quote.volume || 0);
  }
  return {
    up,
    down,
    flat,
    avgPct: sum / Math.max(1, market.symbols.length),
    turnover,
    count: market.symbols.length,
  };
}

/** Equal-weight index level from the daily closes of the constituents. */
export function proxyIndexSeries(market: MarketData): { ts: number; value: number }[] {
  const n = market.symbols.length;
  if (!n) return [];
  const len = Math.min(...market.symbols.map((s) => s.daily.length));
  const out: { ts: number; value: number }[] = [];
  for (let i = 0; i < len; i++) {
    let sum = 0;
    let ts = 0;
    for (const s of market.symbols) {
      const bar = s.daily[s.daily.length - len + i];
      sum += bar[4];
      ts = bar[0];
    }
    out.push({ ts, value: sum / n });
  }
  return out;
}

export interface LiveQuote {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
}

export async function fetchLiveQuotes(serverUrl: string): Promise<LiveQuote[]> {
  const base = serverUrl.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${base}/api/quotes`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new DataError(`Live server: HTTP ${res.status}`);
    const body = (await res.json()) as { quotes?: LiveQuote[] };
    if (!body || !Array.isArray(body.quotes)) throw new DataError("Live server returned no quotes");
    return body.quotes;
  } finally {
    clearTimeout(timer);
  }
}
