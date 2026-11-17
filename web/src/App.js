import React, { useMemo, useState } from 'react';
import { useMarketData } from './hooks/useMarketData';
import StockCard from './components/StockCard';
import GlassCard from './components/GlassCard';
import { formatCompact, formatTime } from './utils/format';
import './App.css';

const SORT_OPTIONS = [
  { value: 'default', label: 'Default order' },
  { value: 'gainers', label: 'Top gainers' },
  { value: 'losers', label: 'Top losers' },
  { value: 'volume', label: 'Highest volume' }
];

function App() {
  const { data, isLoading, mode, error } = useMarketData();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');

  const stocks = useMemo(() => {
    const list = data?.indicators ? [...data.indicators] : [];
    const needle = query.trim().toUpperCase();
    const filtered = needle
      ? list.filter(
          (stock) =>
            stock.symbol.includes(needle) || stock.name.toUpperCase().includes(needle)
        )
      : list;

    if (sort === 'gainers') filtered.sort((a, b) => b.percentChange - a.percentChange);
    if (sort === 'losers') filtered.sort((a, b) => a.percentChange - b.percentChange);
    if (sort === 'volume') filtered.sort((a, b) => b.volume - a.volume);
    return filtered;
  }, [data, query, sort]);

  const stats = useMemo(() => {
    const indicators = data?.indicators ?? [];
    const gainers = indicators.filter((stock) => stock.change >= 0).length;
    return {
      symbols: indicators.length,
      gainers,
      losers: indicators.length - gainers,
      volume: indicators.reduce((sum, stock) => sum + stock.volume, 0)
    };
  }, [data]);

  const isLive = mode === 'live';

  return (
    <div className="app">
      <div className="app__glow app__glow--one" aria-hidden="true" />
      <div className="app__glow app__glow--two" aria-hidden="true" />

      <main className="app__content">
        <header className="glass-card hero">
          <div className="hero__brand">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <h1 className="hero__title">
                Stockify <em>Pro</em>
              </h1>
              <p className="hero__subtitle">NSE &middot; BSE market terminal</p>
            </div>
          </div>

          <div
            className={`status-chip ${isLive ? 'status-chip--live' : 'status-chip--demo'}`}
            title={
              isLive
                ? 'Streaming from the Stockify backend'
                : 'No backend connected — prices are simulated in your browser'
            }
          >
            <span className="status-chip__dot" />
            {isLive ? 'LIVE' : 'DEMO FEED'}
          </div>
        </header>

        <GlassCard className="metrics">
          <div className="metric">
            <span className="metric__value">{stats.symbols || '\u2014'}</span>
            <span className="metric__label">Symbols</span>
          </div>
          <div className="metric">
            <span className="metric__value metric__value--up">{stats.gainers || '\u2014'}</span>
            <span className="metric__label">Gainers</span>
          </div>
          <div className="metric">
            <span className="metric__value metric__value--down">{stats.losers || '\u2014'}</span>
            <span className="metric__label">Losers</span>
          </div>
          <div className="metric">
            <span className="metric__value">{formatCompact(stats.volume)}</span>
            <span className="metric__label">Total volume</span>
          </div>
          <div className="metric metric--time">
            <span className="metric__value metric__value--small">
              {formatTime(data?.timestamp)}
            </span>
            <span className="metric__label">Last tick (IST view)</span>
          </div>
        </GlassCard>

        {!isLive && !isLoading && (
          <p className="notice">
            Demo mode: prices are generated in your browser. Start the Node backend and run
            the app with <code>REACT_APP_API_URL=http://localhost:3001</code> to stream live
            ticks over Socket.IO.
          </p>
        )}

        {error && <p className="notice notice--error">{String(error)}</p>}

        <div className="toolbar">
          <label className="search">
            <span className="visually-hidden">Search symbols</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol or company…"
            />
          </label>

          <label className="sort">
            <span className="visually-hidden">Sort instruments</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="empty">Connecting to market feed…</div>
        ) : stocks.length === 0 ? (
          <div className="empty">No instruments match “{query}”.</div>
        ) : (
          <div className="stock-grid">
            {stocks.map((stock) => (
              <StockCard key={stock.symbol} stock={stock} />
            ))}
          </div>
        )}

        <footer className="footer">
          <span>Simulated market data for demonstration only. Not investment advice.</span>
          <span className="footer__badge">Updates every 1s</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
