import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, effectiveNowMs } from "./store";
import { marketClock, type MarketClock } from "./time";
import { priceOf, type PricePoint } from "./prices";
import type { Instrument } from "./types";
import { chime } from "./feedback";

/** Re-render on a wall clock. 1s for live headers, 30s is enough elsewhere. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export function useMarketClock(): MarketClock {
  const rules = useApp((s) => s.rules);
  const replay = useApp((s) => s.replay);
  const now = useNow(1000, !replay);
  const ms = replay ? effectiveNowMs(replay) : now;
  return useMemo(() => marketClock(ms, rules, replay), [ms, rules, replay]);
}

export function usePricePoint(inst: Instrument | null): PricePoint | null {
  const market = useApp((s) => s.market);
  const mode = useApp((s) => s.settings.mode);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const tick = useNow(1000, mode === "live" && !replay);
  void tick;
  return useMemo(
    () => (inst ? priceOf(inst, market, mode, replay, liveQuotes) : null),
    [inst, market, mode, replay, liveQuotes, tick],
  );
}

/** Drives the replay clock: one 5-minute bar every `replaySpeed` ms. */
export function useReplayEngine() {
  const replay = useApp((s) => s.replay);
  const speed = useApp((s) => s.settings.replaySpeed);
  const playing = replay?.playing ?? false;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const state = useApp.getState();
      if (!state.replay) return;
      const next = state.replay.minutes + 5;
      if (next >= 15 * 60 + 30) {
        state.setReplayMinutes(15 * 60 + 30);
        state.setReplayPlaying(false);
        state.pushToast("Replay reached the 15:30 close.", "info");
        return;
      }
      state.setReplayMinutes(next);
    }, Math.max(250, speed || 700));
    return () => window.clearInterval(id);
  }, [playing, speed]);
}

/**
 * In replay only: honour the written plan. A position closes on its stop or
 * target, and anything still open is flattened at the flat-by time. Snapshot
 * mode never auto-closes a static price.
 */
export function useAutoPaperExits() {
  const replay = useApp((s) => s.replay);
  const settings = useApp((s) => s.settings);
  const minutes = replay?.minutes ?? 0;

  useEffect(() => {
    if (!replay) return;
    const state = useApp.getState();
    if (!state.market) return;
    const market = state.market;
    const positions = state.positions.filter((p) => p.date === replay.date);
    for (const p of positions) {
      const inst = market.symbols.find((s) => s.symbol === p.symbol);
      if (!inst) continue;
      const price = priceOf(inst, market, "replay", replay, state.liveQuotes).price;
      if (price <= p.stop + 1e-9) {
        const trade = state.closePosition(p.id, p.stop, "stop");
        if (trade) {
          state.pushToast(`${p.symbol} stopped out at ₹${p.stop.toFixed(2)} · ${trade.pnl >= 0 ? "+" : "−"}₹${Math.abs(trade.pnl).toFixed(2)}`, "red");
          chime("block", settings.sound);
        }
      } else if (price >= p.target - 1e-9) {
        const trade = state.closePosition(p.id, p.target, "target");
        if (trade) {
          state.pushToast(`${p.symbol} hit its target at ₹${p.target.toFixed(2)} · +₹${trade.pnl.toFixed(2)}`, "green");
          chime("success", settings.sound);
        }
      }
    }

    const flat = parseFlatBy(state.rules.flatBy);
    if (replay.minutes >= flat) {
      const stillOpen = useApp.getState().positions.filter((p) => p.date === replay.date);
      if (stillOpen.length) {
        for (const p of stillOpen) {
          const inst = market.symbols.find((s) => s.symbol === p.symbol);
          const price = inst ? priceOf(inst, market, "replay", replay, state.liveQuotes).price : p.entry;
          useApp.getState().closePosition(p.id, price, "flat");
        }
        useApp.getState().pushToast(
          `Flat-by ${state.rules.flatBy}: closed ${stillOpen.length} paper position${stillOpen.length === 1 ? "" : "s"} at the replay price.`,
          "amber",
        );
        chime("alert", settings.sound);
      }
    }
  }, [replay, minutes, settings.sound]);
}

function parseFlatBy(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!m) return 15 * 60 + 15;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Polls the optional live backend while the mode is "live". */
export function useLiveAutoRefresh() {
  const mode = useApp((s) => s.settings.mode);
  const refresh = useApp((s) => s.refreshLive);
  useEffect(() => {
    if (mode !== "live") return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [mode, refresh]);
}

/** Triggers paper alerts when the current price crosses the line. */
export function useAlertWatcher() {
  const market = useApp((s) => s.market);
  const mode = useApp((s) => s.settings.mode);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const alerts = useApp((s) => s.alerts);
  const rules = useApp((s) => s.rules);
  const settings = useApp((s) => s.settings);
  const marked = useRef<Set<string>>(new Set());
  const replayMinutes = replay?.minutes ?? 0;
  const now = useNow(2500, mode !== "replay");
  void now;

  useEffect(() => {
    if (!market) return;
    const active = alerts.filter((a) => !a.triggeredAt && !marked.current.has(a.id));
    if (!active.length) return;
    for (const alert of active) {
      const inst = market.symbols.find((s) => s.symbol === alert.symbol);
      if (!inst) continue;
      const p = priceOf(inst, market, mode, replay, liveQuotes);
      const hit = alert.dir === "above" ? p.price >= alert.price : p.price <= alert.price;
      if (!hit) continue;
      marked.current.add(alert.id);
      const st = useApp.getState();
      st.markAlertTriggered(alert.id, p.price);
      st.pushToast(
        `${alert.symbol} ${alert.dir === "above" ? "crossed above" : "fell below"} ₹${alert.price.toFixed(
          2,
        )} — now ₹${p.price.toFixed(2)}`,
        "amber",
      );
      chime("alert", settings.sound);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`${alert.symbol} price alert`, {
            body: `${alert.dir === "above" ? "Above" : "Below"} ₹${alert.price.toFixed(2)} · now ₹${p.price.toFixed(2)}`,
          });
        } catch {
          /* ignore */
        }
      }
      void rules;
    }
  }, [alerts, market, mode, replay, replayMinutes, liveQuotes, settings.sound, rules]);
}
