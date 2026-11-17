import React from 'react';
import { formatCompact, formatPercent, formatPrice } from '../utils/format';

const StockCard = ({ stock }) => {
  const isUp = stock.change >= 0;
  const range = Math.max(stock.high - stock.low, 0.01);
  const position = Math.min(Math.max(((stock.price - stock.low) / range) * 100, 0), 100);

  return (
    <article className={`stock-card ${isUp ? 'is-up' : 'is-down'}`}>
      <header className="stock-card__head">
        <div>
          <h2 className="stock-card__symbol">{stock.symbol}</h2>
          <p className="stock-card__name">{stock.name}</p>
        </div>
        <span className="stock-card__badge">
          {isUp ? '\u2197' : '\u2198'} {formatPercent(stock.percentChange)}
        </span>
      </header>

      <div className="stock-card__price-row">
        <strong className="stock-card__price">{formatPrice(stock.price)}</strong>
        <span className="stock-card__volume">Vol {formatCompact(stock.volume)}</span>
      </div>

      <div className="stock-card__range">
        <span>L {formatPrice(stock.low)}</span>
        <span>H {formatPrice(stock.high)}</span>
      </div>

      <div className="stock-card__track">
        <div
          className="stock-card__track-fill"
          style={{ width: `${position}%` }}
        />
        <span
          className="stock-card__marker"
          style={{ left: `${position}%` }}
        />
      </div>
    </article>
  );
};

export default React.memo(StockCard);
