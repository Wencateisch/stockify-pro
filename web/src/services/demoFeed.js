const round2 = (value) => Math.round(value * 100) / 100;

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

/**
 * Browser-side simulation of the backend feed. Keeps the web app useful on
 * static hosting (GitHub Pages) where no Node backend is reachable.
 */
export function createDemoFeed() {
  const quotes = new Map();

  const reset = () => {
    quotes.clear();
    INSTRUMENTS.forEach(({ symbol, name, base, sector }) => {
      const open = round2(base * (1 + (Math.random() - 0.5) * 0.006));
      quotes.set(symbol, {
        symbol,
        name,
        sector,
        prevClose: base,
        open,
        price: open,
        high: open,
        low: open,
        volume: Math.floor(Math.random() * 800000)
      });
    });
  };

  const next = () => {
    const indicators = INSTRUMENTS.map(({ symbol }) => {
      const quote = quotes.get(symbol);
      const drift = (Math.random() - 0.5) * 0.0045;
      quote.price = Math.min(
        Math.max(quote.price * (1 + drift), quote.prevClose * 0.94),
        quote.prevClose * 1.06
      );
      quote.high = Math.max(quote.high, quote.price);
      quote.low = Math.min(quote.low, quote.price);
      quote.volume += 20000 + Math.floor(Math.random() * 380000);

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

    const gainers = indicators.filter((s) => s.percentChange >= 0).length;
    return {
      timestamp: new Date().toISOString(),
      source: 'simulated',
      indicators,
      breadth: {
        gainers,
        losers: indicators.length - gainers,
        totalVolume: indicators.reduce((sum, s) => sum + s.volume, 0)
      }
    };
  };

  reset();
  return { next, reset };
}
