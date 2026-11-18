import type { LiveQuote } from "./data";

/**
 * Fallback live source for networks that block Moneycontrol (or your own proxy).
 *
 * A GitHub Actions job fetches Yahoo's public NSE quotes every 5 minutes and
 * publishes one JSON file to the `live-data` branch. raw.githubusercontent.com
 * sends Access-Control-Allow-Origin: *, so this works on web, Android and iOS
 * with no CORS proxy and no user-supplied backend.
 *
 * Prices are exchange-delayed and the feed is a 5-minute snapshot, never sold
 * as a tick stream. The exact exchange timestamp is published with each quote.
 */
const RAW_URL = "https://raw.githubusercontent.com/Wencateisch/stockify-pro/live-data/live.json";
const MAX_AGE_MS = 3 * 60 * 60_000;

interface PublishedDoc {
  generatedAt?: string;
  count?: number;
  quotes?: Array<{
    symbol?: string;
    price?: number;
    prevClose?: number;
    change?: number;
    changePct?: number;
    dayHigh?: number;
    dayLow?: number;
    volume?: number;
    asOf?: number;
  }>;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchPublishedQuotes(): Promise<LiveQuote[]> {
  const res = await fetch(`${RAW_URL}?t=${Date.now()}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Published feed returned HTTP ${res.status}.`);

  const doc = (await res.json()) as PublishedDoc;
  const age = Date.now() - Date.parse(doc.generatedAt || "");
  if (!Number.isFinite(age) || age < -60_000) throw new Error("The published feed has no valid timestamp.");
  if (age > MAX_AGE_MS) throw new Error("The published feed is older than 3 hours.");

  const quotes: LiveQuote[] = [];
  for (const q of doc.quotes || []) {
    const symbol = String(q.symbol || "").toUpperCase();
    const price = num(q.price);
    const prevClose = num(q.prevClose);
    if (!symbol || !(price > 0) || !(prevClose > 0)) continue;
    quotes.push({
      symbol,
      price,
      prevClose,
      change: num(q.change) || price - prevClose,
      changePct: num(q.changePct) || ((price - prevClose) / prevClose) * 100,
      dayHigh: num(q.dayHigh),
      dayLow: num(q.dayLow),
      volume: num(q.volume),
      asOf: num(q.asOf) || Date.parse(doc.generatedAt || ""),
    });
  }
  if (quotes.length < 45) throw new Error(`The published feed only had ${quotes.length} usable quotes.`);
  return quotes;
}
