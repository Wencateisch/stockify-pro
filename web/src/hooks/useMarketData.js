import { useCallback, useEffect, useState } from 'react';
import { marketService } from '../services/MarketService';

export const useMarketData = () => {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('demo');
  const [error, setError] = useState(null);

  useEffect(() => {
    const offData = marketService.on('marketData', (market) => {
      setData(market);
      setError(null);
    });
    const offMode = marketService.on('mode', setMode);

    marketService.connect();

    return () => {
      offData();
      offMode();
      marketService.disconnect();
    };
  }, []);

  const subscribe = useCallback((symbols) => marketService.subscribe?.(symbols), []);

  return {
    data,
    isLoading: !data,
    mode,
    isConnected: mode === 'live',
    error,
    subscribe
  };
};
