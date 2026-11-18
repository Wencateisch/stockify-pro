#!/usr/bin/env node
/**
 * publish-live.mjs
 *
 * Free "backend" for Stockify Pro: a GitHub Actions cron job fetches real NSE
 * quotes from Yahoo Finance's public chart endpoint and publishes one small
 * JSON file. The app reads it from raw.githubusercontent.com (ACAO: *), which
 * works from any browser, the Android WebView and iOS — no CORS proxy, no
 * server, no API key for the user.
 *
 * Nothing is invented: a symbol is included only when Yahoo returns a real
 * price, and the whole run fails (does not publish) if fewer than 45 of 50
 * names are usable. Prices are exchange-delayed; the exact feed timestamp is
 * published with them and shown in the app.
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "out");
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const CONCURRENCY = 5;
const TIMEOUT_MS = 12_000;
const MIN_QUOTES = 45;

const market = JSON.parse(await readFile(path.join(ROOT, "app", "public", "data", "market.json"), "utf8"));
const symbols = market.symbols.map((s) => s.symbol);

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function fetchQuote(symbol, host) {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(`${symbol}.NS`)}?interval=1d&range=5d&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const r = body?.chart?.result?.[0];
  if (!r) throw new Error(body?.chart?.error?.description || "no chart result");

  const closes = (r.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === "number" && v > 0);
  const price = n(r.meta?.regularMarketPrice) || closes[closes.length - 1] || 0;
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : n(r.meta?.chartPreviousClose);
  if (!(price > 0) || !(prevClose > 0)) throw new Error("no usable price");

  const epoch = n(r.meta?.regularMarketTime) || Math.floor(Date.now() / 1000);
  return {
    symbol,
    price,
    prevClose,
    change: price - prevClose,
    changePct: ((price - prevClose) / prevClose) * 100,
    dayHigh: n(r.meta?.regularMarketDayHigh),
    dayLow: n(r.meta?.regularMarketDayLow),
    volume: n(r.meta?.regularMarketVolume),
    asOf: epoch * 1000,
  };
}

async function fetchWithRetry(symbol) {
  let last = null;
  for (const host of HOSTS) {
    try {
      return await fetchQuote(symbol, host);
    } catch (err) {
      last = err;
    }
  }
  console.warn(`  ! ${symbol}: ${last instanceof Error ? last.message : last}`);
  return null;
}

const queue = symbols.slice();
const quotes = [];

async function worker() {
  while (queue.length) {
    const symbol = queue.shift();
    const q = await fetchWithRetry(symbol);
    if (q) quotes.push(q);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
quotes.sort((a, b) => a.symbol.localeCompare(b.symbol));

if (quotes.length < MIN_QUOTES) {
  throw new Error(`Only ${quotes.length}/${symbols.length} quotes returned; refusing to publish a partial feed.`);
}

const doc = {
  generatedAt: new Date().toISOString(),
  source: "Yahoo Finance NSE chart API",
  publishedBy: "GitHub Actions",
  intervalMinutes: 5,
  notes: "Exchange-delayed NSE quotes. Not the NIFTY 50 index. No prices are simulated.",
  count: quotes.length,
  quotes,
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "live.json"), JSON.stringify(doc));
console.log(`Published ${quotes.length}/${symbols.length} quotes at ${doc.generatedAt}`);
