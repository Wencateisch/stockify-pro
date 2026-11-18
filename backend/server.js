/**
 * Stockify Pro live feed
 *
 * A thin, honest proxy in front of Yahoo Finance's public chart endpoint.
 * It does not generate, smooth, interpolate or invent a single price: every
 * number it serves is copied from the upstream `meta` block of the last
 * delivered 1-day / 5-minute chart for that NSE ticker.
 *
 *   GET /health                 liveness + last refresh
 *   GET /api/quotes             { quotes: [...], asOf, stale }
 *   GET /api/quotes/:symbol     one quote
 *   GET /api/chart/:symbol      raw Yahoo chart passthrough (range, interval)
 *   GET /api/news               Nifty 50 headlines from Yahoo's RSS feed
 *   Socket.IO `quotes`          the same array, pushed on every refresh
 *
 * Config:
 *   PORT          default 3001
 *   CORS_ORIGIN   default *   (set to your Pages origin in production)
 *   REFRESH_MS    default 15000, minimum 5000
 *   QUOTE_TTL_MS  default 10000
 */

'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { SYMBOLS, BY_SYMBOL } = require('./symbols');

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const REFRESH_MS = Math.max(5000, Number(process.env.REFRESH_MS) || 15000);
const QUOTE_TTL_MS = Math.max(2000, Number(process.env.QUOTE_TTL_MS) || 10000);

const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 9000;
const CONCURRENCY = 6;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET'] },
  transports: ['websocket', 'polling'],
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ------------------------------------------------------------------ upstream */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch upstream JSON with a hard timeout, host rotation and one retry. */
async function yahooJson(pathname, attempt = 0) {
  const host = HOSTS[attempt % HOSTS.length];
  const url = `https://${host}${pathname}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'en-IN,en;q=0.9',
      },
    });
    if (!res.ok) {
      const err = new Error(`Yahoo ${res.status} for ${pathname}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } catch (err) {
    const retryable =
      attempt < 2 &&
      (err.name === 'AbortError' || !err.status || err.status === 429 || err.status >= 500);
    if (retryable) {
      await sleep(400 * (attempt + 1));
      return yahooJson(pathname, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function num(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

/** Build one quote from a chart payload, or null when the payload is unusable. */
function quoteFromChart(symbol, body) {
  const result = body && body.chart && body.chart.result && body.chart.result[0];
  if (!result || !result.meta) return null;
  const meta = result.meta;

  let price = num(meta.regularMarketPrice);
  if (price === null) {
    const closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = num(closes[i]);
      if (c !== null) {
        price = c;
        break;
      }
    }
  }
  if (price === null) return null;

  const prevClose = num(meta.chartPreviousClose) ?? num(meta.previousClose) ?? price;
  const change = Math.round((price - prevClose) * 100) / 100;
  const changePct = prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : 0;

  return {
    symbol,
    price: Math.round(price * 100) / 100,
    prevClose: Math.round(prevClose * 100) / 100,
    change,
    changePct,
    dayHigh: Math.round((num(meta.regularMarketDayHigh) ?? price) * 100) / 100,
    dayLow: Math.round((num(meta.regularMarketDayLow) ?? price) * 100) / 100,
    volume: num(meta.regularMarketVolume) ?? 0,
    currency: meta.currency || 'INR',
    exchange: meta.exchangeName || 'NSE',
    marketTime: num(meta.regularMarketTime),
    stale: false,
  };
}

const cache = new Map(); // symbol -> { quote, at }
const inflight = new Map(); // symbol -> Promise

async function fetchQuote(symbol, { maxAgeMs = QUOTE_TTL_MS } = {}) {
  const inst = BY_SYMBOL.get(symbol.toUpperCase());
  if (!inst) {
    const err = new Error(`Unknown symbol: ${symbol}`);
    err.status = 404;
    throw err;
  }
  const hit = cache.get(inst.symbol);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.quote;
  if (inflight.has(inst.symbol)) return inflight.get(inst.symbol);

  const job = (async () => {
    const pathname = `/v8/finance/chart/${encodeURIComponent(inst.yahoo)}?range=1d&interval=5m&includePrePost=false`;
    const body = await yahooJson(pathname);
    const quote = quoteFromChart(inst.symbol, body);
    if (!quote) throw new Error(`Yahoo returned no usable quote for ${inst.symbol}`);
    cache.set(inst.symbol, { quote, at: Date.now() });
    return quote;
  })().finally(() => inflight.delete(inst.symbol));

  inflight.set(inst.symbol, job);
  return job;
}

/** Run tasks with a small concurrency cap so Yahoo does not rate-limit us. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchAllQuotes() {
  const results = await mapLimit(SYMBOLS, CONCURRENCY, async (inst) => {
    try {
      return await fetchQuote(inst.symbol);
    } catch (err) {
      // A stale cached quote is still a real quote; mark it rather than fake one.
      const hit = cache.get(inst.symbol);
      if (hit) return { ...hit.quote, stale: true, error: String(err.message || err) };
      return { symbol: inst.symbol, error: String(err.message || err) };
    }
  });
  const quotes = results.filter((q) => q && typeof q.price === 'number');
  return quotes;
}

let snapshot = { quotes: [], asOf: null, errors: 0 };

async function refresh() {
  const started = Date.now();
  try {
    const quotes = await fetchAllQuotes();
    snapshot = {
      quotes,
      asOf: new Date().toISOString(),
      tookMs: Date.now() - started,
      errors: SYMBOLS.length - quotes.length,
    };
    if (quotes.length) io.emit('quotes', snapshot);
  } catch (err) {
    snapshot = { ...snapshot, asOf: new Date().toISOString(), errors: SYMBOLS.length, error: String(err.message || err) };
    console.error('[feed] refresh failed:', err.message || err);
  }
}

/* ------------------------------------------------------------------ routes */

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'stockify-pro-api',
    source: 'Yahoo Finance chart endpoint (unofficial, delayed by the exchange)',
    symbols: SYMBOLS.length,
    quotes: snapshot.quotes.length,
    asOf: snapshot.asOf,
    tookMs: snapshot.tookMs,
    errors: snapshot.errors || 0,
    refreshMs: REFRESH_MS,
  });
});

app.get('/api/symbols', (_req, res) => {
  res.json({ symbols: SYMBOLS.map(({ symbol, name, sector }) => ({ symbol, name, sector })) });
});

app.get('/api/quotes', async (req, res) => {
  const only = String(req.query.symbols || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  try {
    if (only.length) {
      const quotes = (
        await mapLimit(only, CONCURRENCY, (s) => fetchQuote(s).catch(() => null))
      ).filter((q) => q && typeof q.price === 'number');
      return res.json({ quotes, asOf: new Date().toISOString(), source: 'yahoo' });
    }
    if (!snapshot.quotes.length) await refresh();
    res.json({
      quotes: snapshot.quotes,
      asOf: snapshot.asOf,
      source: 'yahoo',
      stale: Date.now() - new Date(snapshot.asOf || 0).getTime() > REFRESH_MS * 2,
    });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err), quotes: snapshot.quotes });
  }
});

app.get('/api/quotes/:symbol', async (req, res) => {
  try {
    res.json(await fetchQuote(req.params.symbol));
  } catch (err) {
    res.status(err.status || 502).json({ error: String(err.message || err) });
  }
});

app.get('/api/chart/:symbol', async (req, res) => {
  const inst = BY_SYMBOL.get(String(req.params.symbol || '').toUpperCase());
  if (!inst) return res.status(404).json({ error: 'Unknown symbol' });
  const range = /^[0-9a-z]{1,10}$/.test(String(req.query.range || '')) ? req.query.range : '1d';
  const interval = /^[0-9a-z]{1,6}$/.test(String(req.query.interval || '')) ? req.query.interval : '5m';
  try {
    const body = await yahooJson(
      `/v8/finance/chart/${encodeURIComponent(inst.yahoo)}?range=${range}&interval=${interval}&includePrePost=false`
    );
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

/** Minimal RSS headline reader (no XML dependency, no scraped body text). */
function parseRssItems(xml, limit) {
  const items = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const pick = (tag) => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
      if (!m) return '';
      return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    };
    const title = pick('title');
    if (!title) continue;
    items.push({ title, link: pick('link'), publishedAt: pick('pubDate'), source: pick('source') });
    if (items.length >= limit) break;
  }
  return items;
}

app.get('/api/news', async (req, res) => {
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const rss = await fetch(
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5ENSEI&region=IN&lang=en-IN',
      { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'application/rss+xml,application/xml,text/xml,*/*' } }
    );
    if (!rss.ok) throw new Error(`Yahoo RSS ${rss.status}`);
    const xml = await rss.text();
    res.json({ items: parseRssItems(xml, limit), asOf: new Date().toISOString(), source: 'yahoo-rss' });
  } catch (err) {
    res.status(502).json({ items: [], error: String(err.message || err) });
  } finally {
    clearTimeout(timer);
  }
});

/* Optional: serve a built copy of the web app from the same origin (Docker). */
if (process.env.STATIC_DIR) {
  const path = require('path');
  const root = path.resolve(process.env.STATIC_DIR);
  app.use(express.static(root, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
} else {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
}

/* ------------------------------------------------------------------ boot */

io.on('connection', (socket) => {
  if (snapshot.quotes.length) socket.emit('quotes', snapshot);
});

const timer = setInterval(refresh, REFRESH_MS);
if (timer.unref) timer.unref();

server.listen(PORT, () => {
  console.log(`Stockify Pro feed on http://localhost:${PORT} (refresh ${REFRESH_MS} ms, ${SYMBOLS.length} symbols)`);
  refresh().catch(() => {});
});
