/**
 * Stockify Pro backend
 *
 * Simulated NSE/BSE market feed exposed over REST + Socket.IO.
 * A new tick is generated every second and broadcast to all connected
 * clients as a `marketData` event.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const TICK_MS = Number(process.env.TICK_MS) || 1000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  transports: ['websocket', 'polling']
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const INSTRUMENTS = [
  { symbol: 'NIFTY50', name: 'NIFTY 50', base: 22000, sector: 'INDEX' },
  { symbol: 'BANKNIFTY', name: 'Bank Nifty', base: 48000, sector: 'INDEX' },
  { symbol: 'SENSEX', name: 'SENSEX', base: 73000, sector: 'INDEX' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', base: 3800, sector: 'IT' },
  { symbol: 'RELIANCE', name: 'Reliance Industries', base: 2800, sector: 'ENERGY' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', base: 1650, sector: 'FINANCIAL' },
  { symbol: 'INFY', name: 'Infosys', base: 1600, sector: 'IT' },
  { symbol: 'WIPRO', name: 'Wipro', base: 480, sector: 'IT' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', base: 1200, sector: 'FINANCIAL' },
  { symbol: 'HUL', name: 'Hindustan Unilever', base: 2300, sector: 'FMCG' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', base: 1100, sector: 'PHARMA' },
  { symbol: 'ITC', name: 'ITC', base: 450, sector: 'FMCG' },
  { symbol: 'LT', name: 'Larsen & Toubro', base: 3200, sector: 'INFRA' }
];

const round2 = (value) => Math.round(value * 100) / 100;

/** Live state per symbol; seeded once at boot. */
const quotes = new Map();

function seedQuotes() {
  quotes.clear();
  INSTRUMENTS.forEach(({ symbol, base }) => {
    const open = round2(base * (1 + (Math.random() - 0.5) * 0.006));
    quotes.set(symbol, {
      symbol,
      name: INSTRUMENTS.find((i) => i.symbol === symbol).name,
      sector: INSTRUMENTS.find((i) => i.symbol === symbol).sector,
      prevClose: base,
      open,
      price: open,
      high: open,
      low: open,
      volume: Math.floor(Math.random() * 800000)
    });
  });
}

/** Advance every quote by a small random walk. */
function advanceMarket() {
  quotes.forEach((quote) => {
    const drift = (Math.random() - 0.5) * 0.0045;
    const next = quote.price * (1 + drift);
    quote.price = Math.min(Math.max(next, quote.prevClose * 0.94), quote.prevClose * 1.06);
    quote.high = Math.max(quote.high, quote.price);
    quote.low = Math.min(quote.low, quote.price);
    quote.volume += 20000 + Math.floor(Math.random() * 380000);
  });
}

function quoteList() {
  return Array.from(quotes.values()).map((quote) => {
    const change = quote.price - quote.prevClose;
    return {
      symbol: quote.symbol,
      name: quote.name,
      sector: quote.sector,
      price: round2(quote.price),
      change: round2(change),
      percentChange: round2((change / quote.prevClose) * 100),
      open: round2(quote.open),
      high: round2(quote.high),
      low: round2(quote.low),
      prevClose: round2(quote.prevClose),
      volume: quote.volume,
      timestamp: new Date().toISOString()
    };
  });
}

function sectorSummary(indicators) {
  const bySector = {};
  indicators.forEach((stock) => {
    if (!bySector[stock.sector]) bySector[stock.sector] = [];
    bySector[stock.sector].push(stock);
  });

  return Object.entries(bySector).map(([sector, stocks]) => {
    const avg = stocks.reduce((sum, s) => sum + s.percentChange, 0) / stocks.length;
    return {
      name: `${sector} Sector`,
      percentChange: round2(avg),
      change: round2(stocks.reduce((sum, s) => sum + s.change, 0)),
      constituents: stocks.length
    };
  });
}

function marketSnapshot() {
  const indicators = quoteList();
  return {
    timestamp: new Date().toISOString(),
    source: 'simulated',
    indicators,
    sectorData: sectorSummary(indicators),
    breadth: {
      gainers: indicators.filter((s) => s.percentChange >= 0).length,
      losers: indicators.filter((s) => s.percentChange < 0).length,
      totalVolume: indicators.reduce((sum, s) => sum + s.volume, 0)
    }
  };
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('marketData', marketSnapshot());

  socket.on('subscribe', (symbols) => {
    if (Array.isArray(symbols)) {
      socket.data.subscriptions = symbols.map((s) => String(s).toUpperCase());
    }
  });

  socket.on('unsubscribe', () => {
    socket.data.subscriptions = [];
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, reason);
  });
});

let lastTickAt = Date.now();
setInterval(() => {
  advanceMarket();
  const snapshot = marketSnapshot();
  lastTickAt = Date.now();
  io.emit('marketData', snapshot);
  io.emit('priceUpdate', snapshot.indicators);
}, TICK_MS).unref();

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    name: 'Stockify Pro API',
    version: '1.0.0',
    endpoints: ['/health', '/api/market', '/api/prices', '/api/prices/:symbol', '/api/indicators', '/api/stats']
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    lastTickAt: new Date(lastTickAt).toISOString(),
    symbols: quotes.size,
    clients: io.engine.clientsCount
  });
});

app.get('/api/market', (req, res) => res.json(marketSnapshot()));

app.get('/api/prices', (req, res) => res.json(quoteList()));

app.get('/api/prices/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const stock = quoteList().find((s) => s.symbol === symbol);
  if (!stock) {
    return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
  }
  res.json(stock);
});

app.get('/api/indicators', (req, res) => {
  res.json({
    symbols: INSTRUMENTS.map((i) => i.symbol),
    descriptions: Object.fromEntries(INSTRUMENTS.map((i) => [i.symbol, i.name]))
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    activeClients: io.engine.clientsCount,
    uptime: Math.round(process.uptime()),
    serverTime: new Date().toISOString(),
    tickIntervalMs: TICK_MS
  });
});

// Serve the built React app when it exists (single-service deployments).
const webBuild = path.join(__dirname, '..', 'web', 'build');
if (fs.existsSync(webBuild)) {
  app.use(express.static(webBuild));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(webBuild, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

seedQuotes();

server.listen(PORT, () => {
  console.log(`Stockify Pro API listening on http://localhost:${PORT} (tick ${TICK_MS}ms)`);
});

function shutdown() {
  console.log('Shutting down…');
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server, marketSnapshot, advanceMarket, quoteList };
