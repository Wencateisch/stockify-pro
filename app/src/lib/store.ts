import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  ClosedTrade,
  MarketData,
  PaperPosition,
  PriceAlert,
  Rules,
  Settings,
} from "./types";
import type { LiveQuote } from "./data";
import { loadMarket, fetchLiveQuotes } from "./data";
import { fetchMcQuotes, MC_IDS } from "./mc";
import { istDateStr, istTs } from "./time";

export interface Toast {
  id: string;
  message: string;
  kind: "info" | "green" | "red" | "amber";
}

export interface ReplayState {
  date: string;
  minutes: number;
  playing: boolean;
}

export const DEFAULT_RULES: Rules = {
  capital: 500000,
  maxLossPerTrade: 2000,
  maxPositionPct: 50,
  maxOrder: 100000,
  cashBufferPct: 10,
  minOrder: 500,
  maxTradesPerDay: 3,
  maxOrdersPerDay: 10,
  maxDailyLoss: 6000,
  minRewardRisk: 1,
  requireStop: true,
  noEntriesBefore: "09:45",
  noEntriesAfter: "15:00",
  flatBy: "15:15",
  blocked: [],
  paper: true,
};

export const DEFAULT_SETTINGS: Settings = {
  mode: "snapshot",
  liveSource: "direct",
  serverUrl: "http://localhost:3001",
  sound: true,
  haptics: true,
  selectedSession: "",
  replaySpeed: 700,
};

const DEFAULT_WATCHLIST = ["RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "SBIN"];

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

interface AppState {
  market: MarketData | null;
  marketError: string | null;
  marketLoading: boolean;
  loadMarketData: () => Promise<void>;

  liveQuotes: Record<string, LiveQuote>;
  liveSeries: { t: number; value: number }[];
  liveError: string | null;
  liveLoading: boolean;
  /** Local time of the last completed poll, used for the "next update in" timer. */
  lastLiveRefreshAt: number;
  refreshLive: () => Promise<void>;
  /** One tap from any screen: leave replay, switch to live, fetch the quotes. */
  goLive: () => Promise<void>;

  rules: Rules;
  setRules: (patch: Partial<Rules>) => void;

  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;

  watchlist: string[];
  toggleWatch: (symbol: string) => void;

  positions: PaperPosition[];
  closedTrades: ClosedTrade[];
  addPosition: (p: Omit<PaperPosition, "id" | "openedAt">) => PaperPosition;
  closePosition: (id: string, exitPrice: number, outcome?: ClosedTrade["outcome"]) => ClosedTrade | null;
  flattenAll: (priceOf: (symbol: string) => number) => void;
  resetPaper: () => void;

  alerts: PriceAlert[];
  addAlert: (a: Omit<PriceAlert, "id" | "createdAt" | "triggeredAt" | "triggeredPrice">) => void;
  removeAlert: (id: string) => void;
  markAlertTriggered: (id: string, price: number) => void;

  toasts: Toast[];
  pushToast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;

  replay: ReplayState | null;
  startReplay: (date: string, minutes: number) => void;
  stopReplay: () => void;
  setReplayMinutes: (minutes: number) => void;
  setReplayPlaying: (playing: boolean) => void;

  introSeen: boolean;
  setIntroSeen: (v: boolean) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      market: null,
      marketError: null,
      marketLoading: false,
      loadMarketData: async () => {
        if (get().marketLoading) return;
        set({ marketLoading: true, marketError: null });
        try {
          const market = await loadMarket();
          const sessionDate = market.symbols.find((s) => s.intraday.length)?.intraday[0]?.[0];
          const intradayDate = sessionDate ? istDateStr(sessionDate * 1000) : market.session.date;
          set((s) => ({
            market,
            marketLoading: false,
            settings: { ...s.settings, selectedSession: s.settings.selectedSession || intradayDate },
          }));
        } catch (err) {
          set({
            marketError: err instanceof Error ? err.message : String(err),
            marketLoading: false,
          });
        }
      },

      liveQuotes: {},
      liveSeries: [],
      liveError: null,
      liveLoading: false,
      lastLiveRefreshAt: 0,
      refreshLive: async () => {
        const { settings, liveLoading } = get();
        if (liveLoading) return;
        set({ liveLoading: true });
        try {
          const quotes =
            settings.liveSource === "server"
              ? await fetchLiveQuotes(settings.serverUrl)
              : await fetchMcQuotes(Object.keys(MC_IDS));
          if (!quotes.length) {
            throw new Error(
              settings.liveSource === "server"
                ? "The server returned no usable quotes."
                : "The direct feed returned no usable quotes. Check the connection and try again.",
            );
          }
          const fresh: Record<string, LiveQuote> = {};
          for (const q of quotes) fresh[q.symbol.toUpperCase()] = { ...q, symbol: q.symbol.toUpperCase() };
          const stamps = quotes.map((q) => q.asOf || 0).filter((x) => x > 0);
          const t = stamps.length ? Math.max(...stamps) : Date.now();
          const wanted = settings.liveSource === "direct" ? Object.keys(MC_IDS) : null;
          set((s) => {
            // A slow or rate-limited symbol must not erase the last good quote, or the
            // equal-weight level would jump every time one request times out.
            const map: Record<string, LiveQuote> = { ...s.liveQuotes, ...fresh };
            for (const sym of Object.keys(map)) {
              const q = map[sym];
              if (!q || !(q.price > 0) || !(q.prevClose > 0)) delete map[sym];
            }
            const pool = (wanted ? wanted.map((k) => map[k]) : Object.values(map)).filter(
              (q): q is LiveQuote => !!q && q.prevClose > 0 && q.price > 0,
            );
            const ratio = pool.length
              ? pool.reduce((a, q) => a + q.price / q.prevClose, 0) / pool.length
              : 1;
            let series = s.liveSeries;
            const last = series[series.length - 1];
            if (last && istDateStr(last.t) !== istDateStr(t)) series = [];
            const next = series.slice();
            if (next.length && t - next[next.length - 1].t < 4_000) {
              next[next.length - 1] = { t, value: ratio * 10_000 };
            } else {
              next.push({ t, value: ratio * 10_000 });
            }
            return {
              liveQuotes: map,
              liveSeries: next.slice(-240),
              liveError: null,
              liveLoading: false,
              lastLiveRefreshAt: Date.now(),
            };
          });
        } catch (err) {
          set({
            liveError: err instanceof Error ? err.message : String(err),
            liveLoading: false,
            lastLiveRefreshAt: Date.now(),
          });
        }
      },

      goLive: async () => {
        if (get().replay) get().stopReplay();
        if (get().settings.mode !== "live") {
          set((s) => ({ settings: { ...s.settings, mode: "live" } }));
        }
        await get().refreshLive();
      },

      rules: DEFAULT_RULES,
      setRules: (patch) => set((s) => ({ rules: { ...s.rules, ...patch } })),

      settings: DEFAULT_SETTINGS,
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      watchlist: DEFAULT_WATCHLIST,
      toggleWatch: (symbol) =>
        set((s) => ({
          watchlist: s.watchlist.includes(symbol)
            ? s.watchlist.filter((x) => x !== symbol)
            : [symbol, ...s.watchlist],
        })),

      positions: [],
      closedTrades: [],
      addPosition: (p) => {
        const position: PaperPosition = { ...p, id: uid(), openedAt: Date.now() };
        set((s) => ({ positions: [position, ...s.positions] }));
        return position;
      },
      closePosition: (id, exitPrice, outcome) => {
        const position = get().positions.find((p) => p.id === id);
        if (!position) return null;
        const pnl = Math.round((exitPrice - position.entry) * position.qty * 100) / 100;
        const r = position.riskPerShare > 0 ? Math.round(((exitPrice - position.entry) / position.riskPerShare) * 100) / 100 : 0;
        let finalOutcome: ClosedTrade["outcome"] = outcome || "manual";
        if (!outcome) {
          if (exitPrice <= position.stop) finalOutcome = "stop";
          else if (exitPrice >= position.target) finalOutcome = "target";
          else finalOutcome = "flat";
        }
        const trade: ClosedTrade = {
          id: uid(),
          symbol: position.symbol,
          name: position.name,
          qty: position.qty,
          entry: position.entry,
          exit: exitPrice,
          stop: position.stop,
          target: position.target,
          pnl,
          r,
          outcome: finalOutcome,
          openedAt: position.openedAt,
          closedAt: Date.now(),
          date: istDateStr(Date.now()),
          setup: position.setup,
        };
        set((s) => ({
          positions: s.positions.filter((p) => p.id !== id),
          closedTrades: [trade, ...s.closedTrades],
        }));
        return trade;
      },
      flattenAll: (priceOf) => {
        const list = get().positions.slice();
        for (const p of list) {
          get().closePosition(p.id, priceOf(p.symbol), "flat");
        }
      },
      resetPaper: () => set({ positions: [], closedTrades: [], alerts: [] }),

      alerts: [],
      addAlert: (a) => {
        const alert: PriceAlert = {
          ...a,
          id: uid(),
          createdAt: Date.now(),
          triggeredAt: null,
          triggeredPrice: null,
        };
        set((s) => ({ alerts: [alert, ...s.alerts] }));
      },      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      markAlertTriggered: (id, price) =>
        set((s) => ({
          alerts: s.alerts.map((a) =>
            a.id === id ? { ...a, triggeredAt: Date.now(), triggeredPrice: price } : a,
          ),
        })),

      toasts: [],
      pushToast: (message, kind = "info") => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, kind }] }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 4200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      replay: null,
      startReplay: (date, minutes) => set({ replay: { date, minutes, playing: false } }),
      stopReplay: () => set({ replay: null }),
      setReplayMinutes: (minutes) =>
        set((s) => (s.replay ? { replay: { ...s.replay, minutes } } : {})),
      setReplayPlaying: (playing) =>
        set((s) => (s.replay ? { replay: { ...s.replay, playing } } : {})),

      introSeen: false,
      setIntroSeen: (v) => set({ introSeen: v }),
    }),
    {
      name: "stockify-pro-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        rules: s.rules,
        settings: { ...s.settings, mode: s.settings.mode === "live" ? "snapshot" : s.settings.mode },
        watchlist: s.watchlist,
        positions: s.positions,
        closedTrades: s.closedTrades,
        alerts: s.alerts,
        introSeen: s.introSeen,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          rules: { ...DEFAULT_RULES, ...(p.rules || {}) },
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings || {}),
            liveSource: p.settings?.liveSource === "server" ? "server" : "direct",
            mode: "snapshot",
          },
          watchlist: Array.isArray(p.watchlist) && p.watchlist.length ? p.watchlist : DEFAULT_WATCHLIST,
          positions: Array.isArray(p.positions) ? p.positions : [],
          closedTrades: Array.isArray(p.closedTrades) ? p.closedTrades : [],
          alerts: Array.isArray(p.alerts) ? p.alerts : [],
        };
      },
    },
  ),
);

export function effectiveNowMs(replay: ReplayState | null): number {
  if (replay) return istTs(replay.date, replay.minutes);
  return Date.now();
}

export function paperCash(state: Pick<AppState, "positions" | "closedTrades" | "rules">): number {
  const realized = state.closedTrades.reduce((a, t) => a + t.pnl, 0);
  const openCost = state.positions.reduce((a, p) => a + p.qty * p.entry, 0);
  return Math.round((state.rules.capital + realized - openCost) * 100) / 100;
}

export function tradesToday(state: Pick<AppState, "closedTrades" | "positions">, today: string): number {
  const opened = state.positions.filter((p) => p.date === today).length;
  const closed = state.closedTrades.filter((t) => t.date === today).length;
  return opened + closed;
}

export function lossAtRiskToday(
  state: Pick<AppState, "closedTrades" | "positions">,
  today: string,
): number {
  const open = state.positions
    .filter((p) => p.date === today)
    .reduce((a, p) => a + p.maxLoss, 0);
  return Math.round(open * 100) / 100;
}

export function realizedPnlToday(state: Pick<AppState, "closedTrades">, today: string): number {
  return Math.round(
    state.closedTrades.filter((t) => t.date === today).reduce((a, t) => a + t.pnl, 0) * 100,
  ) / 100;
}

export function alreadyTraded(
  state: Pick<AppState, "positions" | "closedTrades">,
  symbol: string,
  today: string,
): boolean {
  return (
    state.positions.some((p) => p.symbol === symbol) ||
    state.closedTrades.some((t) => t.symbol === symbol && t.date === today)
  );
}
