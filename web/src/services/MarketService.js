import { io } from 'socket.io-client';
import { createDemoFeed } from './demoFeed';

const TICK_MS = 1000;
const REMOTE_FRESH_MS = 5000;

/**
 * Preferred data source: Socket.IO backend (when configured and reachable).
 * Fallback: built-in simulator, so the UI always has fresh data.
 *
 * Set REACT_APP_API_URL to point at the backend in a production build,
 * e.g. REACT_APP_API_URL=https://your-api.onrender.com
 */
class MarketService {
  constructor() {
    this.url =
      process.env.REACT_APP_API_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

    this.socket = null;
    this.listeners = new Map();
    this.demo = createDemoFeed();
    this.timer = null;
    this.socketTimer = null;
    this.started = false;
    this.mode = 'demo';
    this.remoteMarket = null;
    this.remoteAt = 0;
  }

  connect() {
    if (this.started) return this;
    this.started = true;
    this.emit('mode', 'demo');

    if (this.url) {
      this.connectSocket();
    }

    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    return this;
  }

  connectSocket() {
    this.socket = io(this.url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 5000
    });

    this.socket.on('connect', () => {
      // Wait for the first marketData event before flipping to live.
      this.socketTimer = setTimeout(() => {
        if (this.mode !== 'live') this.setMode('demo');
      }, REMOTE_FRESH_MS);
    });

    this.socket.on('marketData', (data) => {
      if (!data || !Array.isArray(data.indicators)) return;
      this.remoteMarket = data;
      this.remoteAt = Date.now();
      this.setMode('live');
    });

    this.socket.on('disconnect', () => {
      this.remoteMarket = null;
      this.remoteAt = 0;
      this.setMode('demo');
    });
  }

  tick() {
    const remoteIsFresh = this.remoteMarket && Date.now() - this.remoteAt < REMOTE_FRESH_MS;
    const market = remoteIsFresh ? this.remoteMarket : this.demo.next();
    this.emit('marketData', market);
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit('mode', mode);
  }

  disconnect() {
    if (this.timer) clearInterval(this.timer);
    if (this.socketTimer) clearTimeout(this.socketTimer);
    this.timer = null;
    this.socketTimer = null;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.started = false;
    this.remoteMarket = null;
    this.remoteAt = 0;
  }

  subscribe(symbols) {
    this.socket?.emit('subscribe', symbols);
  }

  unsubscribe(symbols) {
    this.socket?.emit('unsubscribe', symbols);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event, data) {
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }
}

export const marketService = new MarketService();
