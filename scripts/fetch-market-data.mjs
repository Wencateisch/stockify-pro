#!/usr/bin/env node
/**
 * fetch-market-data.mjs
 *
 * Downloads Nifty-50 daily + 5-minute bars from the (free, unofficial) Yahoo
 * Finance chart endpoint and writes the bundled market-data snapshot:
 *
 *   app/public/data/market.json
 *   app/public/data/history/<SYMBOL>.json
 *
 * Requirements: Node >= 20 (global fetch). No dependencies.
 *
 * Behaviour:
 *   - 250 ms delay between HTTP requests
 *   - one retry after 2 s on HTTP 429 / 5xx (or network error)
 *   - falls back to query2.finance.yahoo.com after query1 keeps failing
 *   - symbols that still fail are retried once more at the end via query2,
 *     then omitted and reported. Nothing is ever fabricated.
 *
 * Usage: node scripts/fetch-market-data.mjs
 */

import { mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'app', 'public', 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

const UA = 'Mozilla/5.0';
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const REQUEST_GAP_MS = 250;
const RETRY_BACKOFF_MS = 2000;

const DAILY_QUERY = 'range=1y&interval=1d&includePrePost=false&events=div%2Csplit';
const INTRADAY_QUERY = 'range=60d&interval=5m&includePrePost=false';

const DAILY_BARS = 90;          // bars kept in market.json
const MAX_HISTORY_SESSIONS = 60; // complete 5m sessions kept per symbol
const MIN_SESSION_BARS = 70;     // a session needs >= 70 of the 75 slots
const IST_OFFSET_SEC = 19800;    // NSE/IST = UTC+05:30, no DST
const SESSION_START_MIN = 9 * 60 + 15;  // 09:15 IST
const SESSION_END_MIN = 15 * 60 + 25;   // last bar *starts* 15:25 (covers to 15:30)

const SYMBOLS = [
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports', sector: 'Infrastructure' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', sector: 'Healthcare' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer' },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Financials' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Auto' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Financials' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Financials' },
  { symbol: 'BEL', name: 'Bharat Electronics', sector: 'Defence' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom' },
  { symbol: 'BSE', name: 'BSE Ltd', sector: 'Financials' },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Healthcare' },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Energy' },
  { symbol: 'DRREDDY', name: "Dr Reddy's Labs", sector: 'Healthcare' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Auto' },
  { symbol: 'ETERNAL', name: 'Eternal/Zomato', sector: 'Consumer Tech' },
  { symbol: 'GRASIM', name: 'Grasim Industries', sector: 'Industrials' },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'IT' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Financials' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life', sector: 'Financials' },
  { symbol: 'HINDALCO', name: 'Hindalco', sector: 'Metals' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Financials' },
  { symbol: 'INDIGO', name: 'InterGlobe Aviation', sector: 'Aviation' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT' },
  { symbol: 'ITC', name: 'ITC', sector: 'FMCG' },
  { symbol: 'JIOFIN', name: 'Jio Financial', sector: 'Financials' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'Metals' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Financials' },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'Auto' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto' },
  { symbol: 'MAXHEALTH', name: 'Max Healthcare', sector: 'Healthcare' },
  { symbol: 'NESTLEIND', name: 'Nestle India', sector: 'FMCG' },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Energy' },
  { symbol: 'ONGC', name: 'ONGC', sector: 'Energy' },
  { symbol: 'POWERGRID', name: 'Power Grid', sector: 'Energy' },
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'SBILIFE', name: 'SBI Life', sector: 'Financials' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financials' },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance', sector: 'Financials' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Healthcare' },
  { symbol: 'TATACONSUM', name: 'Tata Consumer', sector: 'FMCG' },
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals' },
  { symbol: 'TCS', name: 'TCS', sector: 'IT' },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT' },
  { symbol: 'TITAN', name: 'Titan Company', sector: 'Consumer' },
  { symbol: 'TMPV', name: 'Tata Motors PV', sector: 'Auto' },
  { symbol: 'TRENT', name: 'Trent', sector: 'Consumer' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Industrials' },
];

/* ------------------------------------------------------------------ utils */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

/** IST calendar pieces for a unix-second timestamp. */
function ist(ts) {
  const d = new Date((ts + IST_OFFSET_SEC) * 1000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function isoFromUnix(ts) {
  return new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/* ------------------------------------------------------------------ fetch */

let lastRequestAt = 0;

class FetchError extends Error {
  constructor(message, { status = 0, retryable = true } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function throttledFetch(url) {
  const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  return fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' },
  });
}

async function requestOnce(yahooTicker, query, host) {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahooTicker)}?${query}`;
  let res;
  try {
    res = await throttledFetch(url);
  } catch (err) {
    throw new FetchError(`${host}: ${err?.message || 'network error'}`, { retryable: true });
  }
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new FetchError(`${host}: HTTP ${res.status}`, { status: res.status, retryable });
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new FetchError(`${host}: invalid JSON`, { retryable: true });
  }
  const result = json?.chart?.result?.[0];
  if (!result) {
    const desc = json?.chart?.error?.description || json?.chart?.error?.code || 'no chart result';
    throw new FetchError(`${host}: ${desc}`, { status: 404, retryable: false });
  }
  return result;
}

/**
 * Fetch a chart payload: query1 (1 retry after 2 s on 429/5xx), then query2
 * under the same policy. Throws the last error if every attempt fails.
 */
async function fetchChart(yahooTicker, query, label) {
  let lastErr;
  for (const host of HOSTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await requestOnce(yahooTicker, query, host);
      } catch (err) {
        lastErr = err;
        if (!err.retryable) throw err;
        if (attempt === 1) await sleep(RETRY_BACKOFF_MS);
      }
    }
    if (lastErr && !lastErr.retryable) break;
    process.stderr.write(`  ! ${label} ${host} failed (${lastErr?.message}); trying next host\n`);
  }
  throw lastErr ?? new FetchError(`${label}: unknown failure`);
}

/* ---------------------------------------------------------------- parsing */

/** Yahoo chart payload -> [[t,o,h,l,c,v], ...] ascending, cleaned. */
function parseBars(result) {
  const ts = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const q = result?.indicators?.quote?.[0] ?? {};
  const rows = [];
  let prev = -Infinity;
  for (let i = 0; i < ts.length; i++) {
    const t = Math.floor(Number(ts[i]));
    const o = Number(q.open?.[i]);
    const h = Number(q.high?.[i]);
    const l = Number(q.low?.[i]);
    const c = Number(q.close?.[i]);
    const v = Number(q.volume?.[i]);
    if (!Number.isFinite(t) || t <= prev) continue;
    if (![o, h, l, c].every((x) => Number.isFinite(x) && x > 0)) continue;
    prev = t;
    rows.push([t, r2(o), r2(h), r2(l), r2(c), Number.isFinite(v) && v > 0 ? Math.round(v) : 0]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return rows;
}

/** Group 5m bars into IST sessions and keep the complete ones (>=70 bars). */
function splitSessions(bars5m) {
  const byDate = new Map();
  for (const bar of bars5m) {
    const { date, minutes } = ist(bar[0]);
    if (minutes < SESSION_START_MIN || minutes > SESSION_END_MIN) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(bar);
  }
  const complete = [];
  for (const [date, bars] of byDate) {
    if (bars.length >= MIN_SESSION_BARS) complete.push({ date, bars: bars.sort((a, b) => a[0] - b[0]) });
  }
  complete.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { complete, partialDays: byDate.size - complete.length };
}

function buildQuote(meta, daily) {
  const last = daily[daily.length - 1];
  const price = Number.isFinite(Number(meta?.regularMarketPrice))
    ? Number(meta.regularMarketPrice)
    : last?.[4] ?? 0;

  const quoteTs = Number.isFinite(Number(meta?.regularMarketTime))
    ? Number(meta.regularMarketTime)
    : last?.[0] ?? Math.floor(Date.now() / 1000);
  const quoteDate = ist(quoteTs).date;

  // prevClose must be the close before the quote's session. Yahoo's
  // chartPreviousClose belongs to the start of the requested range, so it is
  // only a last resort.
  let prevClose = NaN;
  const idx = daily.findIndex((b) => ist(b[0]).date === quoteDate);
  if (idx > 0) prevClose = daily[idx - 1][4];
  if (!Number.isFinite(prevClose) && daily.length >= 2 && last && quoteDate !== ist(last[0]).date) {
    prevClose = last[4];
  }
  if (!Number.isFinite(prevClose)) {
    const fallback = Number(meta?.previousClose ?? meta?.chartPreviousClose);
    if (Number.isFinite(fallback) && fallback > 0) prevClose = fallback;
  }
  if (!Number.isFinite(prevClose)) prevClose = price;

  const change = price - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  const barForQuote = idx >= 0 ? daily[idx] : last;

  const dayHigh = Number(meta?.regularMarketDayHigh);
  const dayLow = Number(meta?.regularMarketDayLow);
  const volume = Number(meta?.regularMarketVolume);

  return {
    price: r2(price),
    prevClose: r2(prevClose),
    change: r2(change),
    changePct: r2(changePct),
    dayHigh: r2(Number.isFinite(dayHigh) && dayHigh > 0 ? dayHigh : barForQuote?.[2] ?? price),
    dayLow: r2(Number.isFinite(dayLow) && dayLow > 0 ? dayLow : barForQuote?.[3] ?? price),
    volume: Number.isFinite(volume) && volume > 0 ? Math.round(volume) : barForQuote?.[5] ?? 0,
    asOf: isoFromUnix(quoteTs),
  };
}

/* ------------------------------------------------------------------- main */

async function buildSymbol(entry) {
  const yahoo = `${entry.symbol}.NS`;
  const dailyResult = await fetchChart(yahoo, DAILY_QUERY, `${entry.symbol} daily`);

  let intradayResult = null;
  try {
    intradayResult = await fetchChart(yahoo, INTRADAY_QUERY, `${entry.symbol} 5m`);
  } catch (err) {
    process.stderr.write(`  ! ${entry.symbol}: intraday unavailable (${err.message})\n`);
  }

  const daily = parseBars(dailyResult).slice(-DAILY_BARS);
  if (daily.length < 40) throw new FetchError(`only ${daily.length} daily bars`);

  const { complete } = intradayResult ? splitSessions(parseBars(intradayResult)) : { complete: [] };
  const intraday = complete.length ? complete[complete.length - 1].bars : [];
  const historySessions = complete.slice(-MAX_HISTORY_SESSIONS);
  const historyBars = historySessions.flatMap((s) => s.bars);

  return {
    symbol: {
      symbol: entry.symbol,
      yahoo,
      name: entry.name,
      sector: entry.sector,
      quote: buildQuote(dailyResult.meta, daily),
      daily,
      intraday,
    },
    history: { symbol: entry.symbol, interval: '5m', bars: historyBars },
    sessions: historySessions.length,
    intradayDate: intraday.length ? complete[complete.length - 1].date : null,
  };
}

function serializeMarket(date, entries) {
  const nl = '\n';
  const head = {
    generatedAt: date.generatedAt,
    currency: 'INR',
    exchange: 'NSE',
    source: 'Yahoo Finance chart API (free, unofficial)',
    session: date.session,
  };
  const headLines = Object.entries(head)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(`,${nl}`);
  return `{${nl}${headLines},${nl}  "symbols": [${nl}${entries
    .map((s) => `    ${JSON.stringify(s)}`)
    .join(`,${nl}`)}${nl}  ]${nl}}${nl}`;
}

async function main() {
  const startedAt = Date.now();
  await mkdir(HISTORY_DIR, { recursive: true });

  const results = new Map(); // symbol -> build result
  const failures = new Map(); // symbol -> reason
  const noIntraday = [];

  console.log(`Fetching ${SYMBOLS.length} Nifty-50 symbols from Yahoo Finance...`);
  for (let i = 0; i < SYMBOLS.length; i++) {
    const entry = SYMBOLS[i];
    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${SYMBOLS.length}] ${entry.symbol.padEnd(11)}`);
    try {
      const built = await buildSymbol(entry);
      results.set(entry.symbol, built);
      if (!built.symbol.intraday.length) noIntraday.push(entry.symbol);
      console.log(
        `ok  daily=${built.symbol.daily.length} intraday=${built.symbol.intraday.length}` +
          `${built.intradayDate ? ` (${built.intradayDate})` : ''} sessions=${built.sessions}`
      );
    } catch (err) {
      failures.set(entry.symbol, err.message);
      console.log(`FAIL ${err.message}`);
    }
  }

  // Second chance for symbols that failed entirely: once more via query2 only.
  if (failures.size) {
    console.log(`\nRetrying ${failures.size} failed symbol(s) via query2.finance.yahoo.com...`);
    for (const entry of SYMBOLS.filter((s) => failures.has(s.symbol))) {
      process.stdout.write(`  retry ${entry.symbol.padEnd(11)}`);
      try {
        await sleep(RETRY_BACKOFF_MS);
        const built = await buildSymbolViaQuery2(entry);
        results.set(entry.symbol, built);
        failures.delete(entry.symbol);
        if (!built.symbol.intraday.length) noIntraday.push(entry.symbol);
        console.log(`ok  daily=${built.symbol.daily.length} sessions=${built.sessions}`);
      } catch (err) {
        failures.set(entry.symbol, err.message);
        console.log(`still failing (${err.message})`);
      }
    }
  }

  const ordered = SYMBOLS.map((s) => results.get(s.symbol)).filter(Boolean);
  if (!ordered.length) {
    console.error('\nNo symbols could be fetched. Nothing written.');
    process.exitCode = 1;
    return;
  }

  // session.date = most recent trading date present in any daily series.
  let sessionDate = '';
  for (const r of ordered) {
    for (const bar of r.symbol.daily) {
      const d = ist(bar[0]).date;
      if (d > sessionDate) sessionDate = d;
    }
  }
  if (!sessionDate) {
    const now = new Date();
    sessionDate = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  }

  const generatedAt = new Date().toISOString();
  const marketJson = serializeMarket(
    {
      generatedAt,
      session: { date: sessionDate, open: '09:15', close: '15:30' },
    },
    ordered.map((r) => r.symbol)
  );

  for (const r of ordered) {
    const file = path.join(HISTORY_DIR, `${r.symbol.symbol}.json`);
    await writeFile(file, `${JSON.stringify(r.history)}\n`, 'utf8');
  }

  const marketPath = path.join(DATA_DIR, 'market.json');
  await writeFile(marketPath, marketJson, 'utf8');

  /* ------------------------------------------------------------ validate */

  const problems = [];
  const market = JSON.parse(await readFile(marketPath, 'utf8'));
  if (market.symbols.length !== 50) {
    problems.push(`market.json has ${market.symbols.length} symbols (expected 50)`);
  }

  const required = ['symbol', 'yahoo', 'name', 'sector', 'quote', 'daily', 'intraday'];
  const quoteKeys = ['price', 'prevClose', 'change', 'changePct', 'dayHigh', 'dayLow', 'volume', 'asOf'];
  const barsSane = (bars) =>
    Array.isArray(bars) &&
    bars.every(
      (b, i) =>
        Array.isArray(b) &&
        b.length === 6 &&
        b.every((n) => Number.isFinite(n)) &&
        (i === 0 || b[0] > bars[i - 1][0])
    );
  let badDaily = 0;
  let badPrice = 0;
  let badIntraday = 0;
  for (const s of market.symbols) {
    for (const k of required) if (!(k in s)) problems.push(`${s.symbol}: missing key ${k}`);
    for (const k of quoteKeys) {
      if (!(k in (s.quote ?? {}))) problems.push(`${s.symbol}: quote missing ${k}`);
    }
    if (!barsSane(s.daily) || s.daily.length < 40) {
      badDaily++;
      problems.push(`${s.symbol}: daily bars ${s.daily?.length ?? 0} < 40 or malformed`);
    }
    if (!(s.quote?.price > 0)) {
      badPrice++;
      problems.push(`${s.symbol}: quote.price ${s.quote?.price}`);
    }
    if (!barsSane(s.intraday) || (s.intraday.length !== 0 && s.intraday.length < 60)) {
      badIntraday++;
      problems.push(`${s.symbol}: intraday bars ${s.intraday?.length ?? 0} invalid`);
    }
  }

  const historyFiles = (await readdir(HISTORY_DIR)).filter((f) => f.endsWith('.json'));
  const historyBySymbol = new Map(
    historyFiles.map((f) => [f.replace(/\.json$/, ''), path.join(HISTORY_DIR, f)])
  );
  const historyStats = await Promise.all(
    market.symbols.map(async (s) => {
      const file = historyBySymbol.get(s.symbol);
      if (!file) return { symbol: s.symbol, sessions: 0, missing: true, bytes: 0 };
      const bytes = (await stat(file)).size;
      let json;
      try {
        json = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        return { symbol: s.symbol, sessions: 0, missing: false, bytes, corrupt: true };
      }
      const days = new Set((json.bars ?? []).map((b) => ist(b[0]).date));
      const bars = Array.isArray(json.bars) ? json.bars : [];
      const malformed = bars.some(
        (b) => !Array.isArray(b) || b.length !== 6 || !b.every((n) => Number.isFinite(n))
      );
      const ascending = bars.every((b, i) => i === 0 || b[0] > bars[i - 1][0]);
      if (malformed || !ascending || json.interval !== '5m' || json.symbol !== s.symbol) {
        return { symbol: s.symbol, sessions: 0, missing: false, bytes, corrupt: true };
      }
      return { symbol: s.symbol, sessions: days.size, missing: false, bytes };
    })
  );

  const thinHistory = historyStats.filter((h) => h.sessions < 20);
  for (const h of thinHistory) {
    problems.push(
      `${h.symbol}: history sessions ${h.sessions} < 20${h.missing ? ' (file missing)' : ''}${h.corrupt ? ' (malformed)' : ''}`
    );
  }

  const marketBytes = (await stat(marketPath)).size;
  const historyBytes = historyStats.reduce((a, h) => a + h.bytes, 0);
  const totalBytes = marketBytes + historyBytes;
  const mb = (n) => (n / (1024 * 1024)).toFixed(2);

  const allDaily = market.symbols.map((s) => s.daily);
  const dailyDates = allDaily.flat().map((b) => ist(b[0]).date).sort();
  const intradayDates = market.symbols
    .filter((s) => s.intraday.length)
    .map((s) => ist(s.intraday[0][0]).date)
    .sort();

  console.log('\n=== Snapshot summary ===');
  console.log(`generatedAt        : ${market.generatedAt}`);
  console.log(`session.date       : ${market.session.date} (${market.session.open}-${market.session.close} IST)`);
  console.log(`symbols in file    : ${market.symbols.length} (attempted ${SYMBOLS.length})`);
  console.log(`daily bars         : ${allDaily.reduce((a, b) => a + b.length, 0)} over ${dailyDates[0]} .. ${dailyDates[dailyDates.length - 1]}`);
  console.log(`intraday sessions  : ${intradayDates.length ? `${intradayDates[0]} .. ${intradayDates[intradayDates.length - 1]}` : 'none'}`);
  console.log(`intraday bars total: ${market.symbols.reduce((a, s) => a + s.intraday.length, 0)}`);
  const sessionCounts = historyStats.map((h) => h.sessions);
  console.log(`history files      : ${historyFiles.length} (${Math.min(...sessionCounts)}-${Math.max(...sessionCounts)} sessions each)`);
  console.log(`history >=20 sess  : ${historyStats.filter((h) => h.sessions >= 20).length}/${historyStats.length}`);
  console.log(`sizes              : market.json ${(marketBytes / 1024).toFixed(0)} KB, history ${mb(historyBytes)} MB, total ${mb(totalBytes)} MB`);
  console.log(`validation         : daily<40 ${badDaily}, quote.price<=0 ${badPrice}, intraday invalid ${badIntraday}`);
  if (noIntraday.length) console.log(`no 5m sessions     : ${noIntraday.join(', ')}`);
  if (failures.size) console.log(`FAILED (omitted)   : ${[...failures].map(([s, e]) => `${s} (${e})`).join('; ')}`);

  if (problems.length) {
    console.log(`\nProblems (${problems.length}):`);
    for (const p of problems.slice(0, 40)) console.log(`  - ${p}`);
    if (problems.length > 40) console.log(`  ... ${problems.length - 40} more`);
  } else {
    console.log('All checks passed.');
  }

  console.log(`\nWrote:\n  ${marketPath}\n  ${HISTORY_DIR}${path.sep}<SYMBOL>.json  (${historyFiles.length} files)`);
  console.log(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  if (badDaily || badPrice || badIntraday || thinHistory.length || failures.size) process.exitCode = 1;
}

/** Retry path: query2 only, same retry policy per request. */
async function buildSymbolViaQuery2(entry) {
  const yahoo = `${entry.symbol}.NS`;
  const previousHosts = HOSTS.slice();
  HOSTS.length = 0;
  HOSTS.push('query2.finance.yahoo.com');
  try {
    return await buildSymbol(entry);
  } finally {
    HOSTS.length = 0;
    HOSTS.push(...previousHosts);
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err?.stack || err}`);
  process.exitCode = 1;
});
