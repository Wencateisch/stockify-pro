import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "../components/Navigate";
import { useApp, paperCash, tradesToday, lossAtRiskToday, realizedPnlToday, alreadyTraded } from "../lib/store";
import { useMarketClock, usePricePoint } from "../lib/hooks";
import { orbForInstrument } from "../lib/orb";
import { atr, findSetups, smaSeries } from "../lib/indicators";
import { computePlan, roundTick, STOP_LABELS, TARGET_LABELS, type PlanComputation } from "../lib/plan";
import { sizeTrade, sizingLimitText, bracketOrder } from "../lib/sizing";
import { checkEntry } from "../lib/risk";
import { priceOf, intradaySessionDate } from "../lib/prices";
import { initials, fmtDate } from "../lib/market";
import { navigate, tmPath } from "../router";
import { setTMSeed } from "../lib/draft";
import {
  BAR_MIN,
  OPEN_MIN,
  CLOSE_MIN,
  dateLabel,
  istParts,
  minutesLabel,
  todayIst,
} from "../lib/time";
import { compact, inr, pct, price as fmtPrice, shares, signedInr } from "../lib/format";
import { Icon } from "../components/Icons";
import { SeriesChart, type ChartBand } from "../components/Chart";
import { SetupExplainer, SetupPills } from "../components/SetupPills";
import { Empty, Field, KV, Loading, NumInput, Segmented, Stat } from "../components/UI";
import { Sheet } from "../components/Sheet";
import { chime } from "../lib/feedback";
import type { PlanResult, SetupKey, StopRule, TargetRule } from "../lib/types";

const STOP_OPTIONS: { value: StopRule; label: string }[] = [
  { value: "or-mid", label: "OR mid" },
  { value: "or-low", label: "OR low" },
  { value: "pct", label: "% under" },
  { value: "atr", label: "ATR" },
  { value: "price", label: "Price" },
];

const TARGET_OPTIONS: { value: TargetRule; label: string }[] = [
  { value: "1R", label: "1R" },
  { value: "2R", label: "2R" },
  { value: "price", label: "Price" },
];

function barCloseOf(minutes: number): number {
  return Math.min(15 * 60, Math.max(9 * 60 + 20, Math.ceil(minutes / BAR_MIN) * BAR_MIN));
}

export function SymbolScreen({ symbol }: { symbol: string }) {
  const market = useApp((s) => s.market);
  const loading = useApp((s) => s.marketLoading);
  const rules = useApp((s) => s.rules);
  const settings = useApp((s) => s.settings);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const watchlist = useApp((s) => s.watchlist);
  const toggleWatch = useApp((s) => s.toggleWatch);
  const positions = useApp((s) => s.positions);
  const closedTrades = useApp((s) => s.closedTrades);
  const addPosition = useApp((s) => s.addPosition);
  const addAlert = useApp((s) => s.addAlert);
  const pushToast = useApp((s) => s.pushToast);
  const startReplay = useApp((s) => s.startReplay);
  const clock = useMarketClock();

  const inst = market?.symbols.find((s) => s.symbol === symbol) || null;
  const p = usePricePoint(inst);
  const orb = useMemo(() => (inst ? orbForInstrument(inst, 15, CLOSE_MIN) : null), [inst]);
  const trigger = orb?.hits[0] || null;

  const [range, setRange] = useState<"1D" | "3M">("1D");
  const [entry, setEntry] = useState(0);
  const [entrySource, setEntrySource] = useState<"now" | "breakout" | "custom">("now");
  const [stopRule, setStopRule] = useState<StopRule>("or-mid");
  const [stopParam, setStopParam] = useState(0);
  const [targetRule, setTargetRule] = useState<TargetRule>("2R");
  const [targetParam, setTargetParam] = useState(0);
  const [orderOpen, setOrderOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState(0);
  const [alertDir, setAlertDir] = useState<"above" | "below">("above");
  const initFor = useRef("");

  useEffect(() => {
    if (!inst) return;
    if (initFor.current === inst.symbol) return;
    initFor.current = inst.symbol;
    const px = replay
      ? priceOf(inst, market, "replay", replay, liveQuotes).price
      : inst.quote.price;
    setEntry(roundTick(px));
    setEntrySource("now");
    setStopRule("or-mid");
    setStopParam(1.5);
    setTargetRule("2R");
    setTargetParam(roundTick(px * 1.02));
    setRange("1D");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst]);

  const entryMinutes = useMemo(() => {
    if (entrySource === "breakout" && trigger) return trigger.closeAt;
    if (replay) return barCloseOf(replay.minutes);
    return barCloseOf(clock.minutes || CLOSE_MIN);
  }, [entrySource, trigger, replay, clock.minutes]);

  const atrAtEntry = useMemo(() => {
    if (!inst) return { value: 0, bars: 0 };
    const bars = inst.intraday.filter((b) => istParts(b[0] * 1000).minutes + BAR_MIN <= entryMinutes);
    return atr(bars, 14);
  }, [inst, entryMinutes]);

  const dailyCloses = useMemo(() => (inst ? inst.daily.map((b) => b[4]) : []), [inst]);
  const dailySetups = useMemo(() => (dailyCloses.length > 20 ? findSetups(dailyCloses) : null), [dailyCloses]);
  const setupTags: SetupKey[] = useMemo(() => {
    const tags = dailySetups?.tags.slice() || [];
    if (trigger) tags.unshift("orb");
    return tags;
  }, [dailySetups, trigger]);

  const planCalc: PlanComputation | { error: string } | null = useMemo(() => {
    if (!inst || !(entry > 0)) return null;
    try {
      return computePlan({
        symbol: inst.symbol,
        date: clock.dateStr,
        entry,
        stopRule,
        stopParam,
        targetRule,
        targetParam,
        orHigh: orb?.orHigh || 0,
        orLow: orb?.orLow || 0,
        orMinutes: 15,
        atr: atrAtEntry.value,
        atrBars: atrAtEntry.bars,
        entryMinutes,
        entryBar: -1,
        setup: setupTags[0] || "manual",
        flatBy: rules.flatBy,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [inst, entry, stopRule, stopParam, targetRule, targetParam, orb, atrAtEntry, entryMinutes, setupTags, rules.flatBy, clock.dateStr]);

  const plan: PlanResult | null = planCalc && "plan" in planCalc ? planCalc.plan : null;
  const planWarnings = planCalc && "warnings" in planCalc ? planCalc.warnings : [];

  const cash = paperCash({ positions, closedTrades, rules });
  const sizing = useMemo(
    () => (plan && inst ? sizeTrade({ ...plan, symbol: inst.symbol }, rules, cash) : null),
    [plan, inst, rules, cash],
  );

  const today = clock.dateStr || todayIst();
  const riskToday = lossAtRiskToday({ positions, closedTrades }, today);
  const pnlToday = realizedPnlToday({ closedTrades }, today);
  const entriesToday = tradesToday({ positions, closedTrades }, today);

  const priceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const pos of positions) {
      const i = market?.symbols.find((s) => s.symbol === pos.symbol);
      map[pos.symbol] = i ? priceOf(i, market, settings.mode, replay, liveQuotes).price : pos.entry;
    }
    return map;
  }, [positions, market, settings.mode, replay, liveQuotes]);

  const risk = useMemo(() => {
    if (!plan || !sizing || !inst) return null;
    return checkEntry(
      {
        symbol: inst.symbol,
        side: "buy",
        qty: sizing.qty,
        entry: plan.entry,
        stop: plan.stop,
        target: plan.target,
        value: sizing.cost,
      },
      {
        rules,
        cash,
        positions,
        tradesToday: entriesToday,
        lossToday: Math.round((riskToday + Math.max(0, -pnlToday)) * 100) / 100,
        ordersToday: entriesToday,
        duplicate: alreadyTraded({ positions, closedTrades }, inst.symbol, today),
        prices: priceMap,
        clock,
      },
    );
  }, [plan, sizing, inst, rules, cash, positions, entriesToday, riskToday, pnlToday, closedTrades, today, priceMap, clock]);

  const canPlace = Boolean(sizing && !sizing.refusal && risk?.verdict === "PASS");

  const chart = useMemo(() => {
    if (!inst || !p) return null;
    if (range === "1D") {
      const points = inst.intraday
        .map((b) => {
          const m = istParts(b[0] * 1000).minutes;
          return { x: m, y: b[4], tip: `${minutesLabel(m + BAR_MIN)} · ₹${fmtPrice(b[4])}` };
        })
        .filter((pt) => pt.x >= OPEN_MIN);
      const ticks = [OPEN_MIN, 11 * 60, 13 * 60, 15 * 60 + 15].map((m) => ({ x: m, label: minutesLabel(m) }));
      const bands: ChartBand[] = [
        { value: p.prevClose, color: "rgba(238,242,255,0.42)", label: "prev close" },
        ...(orb && orb.orHigh !== null && orb.orLow !== null
          ? [
              { value: orb.orHigh, color: "rgba(143,179,255,0.55)", label: "OR high" },
              { value: orb.orLow, color: "rgba(143,179,255,0.55)", label: "OR low" },
            ]
          : []),
        ...(plan
          ? [
              { value: plan.entry, color: "#8fb3ff", label: "entry", dashed: false },
              { value: plan.stop, color: "var(--red)", label: "stop", dashed: false },
              { value: plan.target, color: "var(--green)", label: "target", dashed: false },
            ]
          : []),
      ];
      return { points, ticks, bands, minSpan: undefined as number | undefined };
    }
    const bars = inst.daily.slice(-64);
    const closes = inst.daily.map((b) => b[4]);
    const ma = smaSeries(closes, 20);
    const maNow = ma[ma.length - 1];
    const points = bars.map((b) => {
      const d = new Date(b[0] * 1000 + 5.5 * 3600 * 1000);
      const label = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      return { x: b[0], y: b[4], tip: `${label} · ₹${fmtPrice(b[4])}` };
    });
    const ticks = points.length
      ? [0, Math.floor(points.length / 2), points.length - 1].map((i) => ({
          x: points[i].x,
          label: points[i].tip?.split(" · ")[0] || "",
        }))
      : [];
    const bands = maNow ? [{ value: maNow, color: "rgba(185,162,255,0.6)", label: "MA20" }] : [];
    return { points, ticks, bands: bands as ChartBand[], minSpan: undefined as number | undefined };
  }, [inst, p, range, orb, plan]);

  const applyBreakout = () => {
    if (!trigger) return;
    setEntry(trigger.price);
    setEntrySource("breakout");
    setStopRule("or-mid");
    pushToast(`Entry set to the ${minutesLabel(trigger.closeAt)} breakout close ₹${fmtPrice(trigger.price)}.`, "info");
  };

  const resetEntry = () => {
    if (!p) return;
    setEntry(roundTick(p.price));
    setEntrySource("now");
  };

  const changeStop = (r: StopRule) => {
    setStopRule(r);
    if (r === "pct") setStopParam(0.5);
    else if (r === "atr") setStopParam(1.5);
    else if (r === "price") setStopParam(Number((entry * 0.99).toFixed(2)));
  };

  const changeTarget = (r: TargetRule) => {
    setTargetRule(r);
    if (r === "price") setTargetParam(Number((entry * 1.02).toFixed(2)));
  };

  const startSessionReplay = () => {
    if (!inst) return;
    const date = intradaySessionDate(inst);
    if (!date) {
      pushToast("This symbol has no intraday session in the snapshot.", "amber");
      return;
    }
    startReplay(date, OPEN_MIN);
    pushToast(`Replaying ${dateLabel(date, true)} from 09:15.`, "info");
  };

  const sendToTM = () => {
    if (!inst || !plan) return;
    setTMSeed({
      symbol: inst.symbol,
      entry: plan.entry,
      stop: plan.stop,
      target: plan.target,
      entryMinutes,
      entryTimeLabel: minutesLabel(entryMinutes),
      orMinutes: 15,
      orHigh: orb?.orHigh || 0,
      orLow: orb?.orLow || 0,
      stopRule,
      risk: plan.riskPerShare,
      targetR: plan.targetR,
    });
    navigate(tmPath(inst.symbol));
  };

  const placeOrder = () => {
    if (!inst || !sizing || !plan) return;
    addPosition({
      symbol: inst.symbol,
      name: inst.name,
      qty: sizing.qty,
      entry: plan.entry,
      stop: plan.stop,
      target: plan.target,
      riskPerShare: plan.riskPerShare,
      maxLoss: sizing.maxLoss,
      entryTime: entryMinutes,
      setup: setupTags[0] || "manual",
      date: today,
    });
    setOrderOpen(false);
    chime("success", settings.sound);
    pushToast(`Paper buy: ${shares(sizing.qty)} ${inst.symbol} at ₹${fmtPrice(plan.entry)} · risk ${inr(sizing.maxLoss)}.`, "green");
  };

  const openAlert = (price0: number) => {
    if (!p) return;
    // Arming at exactly the current price would be a crossing that already
    // happened, so the default sits 1% away in the chosen direction.
    const exact = price0 <= 0 || Math.abs(price0 - p.price) < 0.0001;
    const level = exact ? p.price * 1.01 : price0;
    setAlertPrice(Number(level.toFixed(2)));
    setAlertDir(level >= p.price ? "above" : "below");
    setAlertOpen(true);
  };

  const createAlert = () => {
    if (!inst || !(alertPrice > 0)) return;
    addAlert({
      symbol: inst.symbol,
      name: inst.name,
      price: alertPrice,
      dir: alertDir,
      baseline: p?.price,
    });
    setAlertOpen(false);
    pushToast(`Alert armed: ${inst.symbol} crosses ${alertDir === "above" ? "above" : "below"} ₹${fmtPrice(alertPrice)}.`, "info");
  };

  if (!inst) {
    if (loading) {
      return (
        <div className="page">
          <div className="glass card"><Loading label="Finding the symbol…" /></div>
        </div>
      );
    }
    return (
      <div className="page">
        <div className="glass card">
          <Empty icon="search" title={`No ${symbol} in the Nifty 50 snapshot`} action={<Navigate to="/scan" label="Back to the scanner" />}>
            The bundled snapshot carries the 50 Nifty 50 constituents. Check the symbol spelling or scan the list.
          </Empty>
        </div>
      </div>
    );
  }

  const watched = watchlist.includes(inst.symbol);
  const held = positions.filter((x) => x.symbol === inst.symbol);
  const dataDate = intradaySessionDate(inst);

  return (
    <div className="page">
      <div className="row" style={{ gap: 12, padding: "2px 2px 0" }}>
        <div className="sym-badge" style={{ width: 46, height: 46, borderRadius: 14, fontSize: 13 }}>
          {initials(inst.symbol)}
        </div>
        <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
          <h1 className="page-title" style={{ fontSize: 24 }}>{inst.symbol}</h1>
          <span className="tiny muted truncate">{inst.name} · {inst.sector}</span>
        </div>
        <button
          type="button"
          className={`icon-btn ${watched ? "active" : ""}`}
          aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
          onClick={() => {
            toggleWatch(inst.symbol);
            pushToast(watched ? `${inst.symbol} removed from the watchlist.` : `${inst.symbol} added to the watchlist.`, "info");
          }}
        >
          <Icon name="star" size={18} filled={watched} />
        </button>
      </div>

      <section className="glass card pad-lg hero">
        <div className="hero-top">
          <div>
            <div className="hero-label">{inst.name}</div>
            <div className="hero-price">₹{p ? fmtPrice(p.price) : "—"}</div>
            <div className="hero-delta" style={{ color: p && p.change >= 0 ? "var(--green)" : "var(--red)" }}>
              <span>{p ? signedInr(p.change) : "—"}</span>
              <span>{p ? pct(p.changePct) : ""}</span>
              <span className="tiny muted nowrap">{p?.source === "replay" ? `replay ${p.atLabel}` : p?.source}</span>
            </div>
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 6 }}>
            <span className="pill green"><span className="live-dot" />Paper</span>
            {setupTags.length > 0 && <span className="pill blue">{setupTags.length} setup{setupTags.length === 1 ? "" : "s"}</span>}
          </div>
        </div>

        <div className="hero-chart" style={{ marginTop: 6 }}>
          {chart && (
            <SeriesChart
              points={chart.points}
              height={188}
              color={(p?.changePct ?? 0) >= 0 ? "var(--green)" : "var(--red)"}
              bands={chart.bands}
              xTicks={chart.ticks}
              yFmt={(n) => n.toFixed(n > 1000 ? 0 : 2)}
              minSpan={chart.minSpan}
            />
          )}
        </div>

        <div className="row between" style={{ marginTop: 6 }}>
          <Segmented
            ariaLabel="Chart range"
            value={range}
            onChange={setRange}
            options={[
              { value: "1D", label: "1D 5-min" },
              { value: "3M", label: "3 months" },
            ]}
          />
          <button type="button" className="btn xs ghost" onClick={startSessionReplay}>
            <Icon name="play" size={12} /> Replay
          </button>
        </div>

        <div className="metrics" style={{ marginTop: 12 }}>
          <div>
            <div className="metric-k">Open</div>
            <div className="metric-v">₹{p ? fmtPrice(inst.intraday[0]?.[1] ?? inst.daily[inst.daily.length - 1]?.[1] ?? 0) : "—"}</div>
          </div>
          <div>
            <div className="metric-k">High</div>
            <div className="metric-v">₹{p ? fmtPrice(p.high) : "—"}</div>
          </div>
          <div>
            <div className="metric-k">Low</div>
            <div className="metric-v">₹{p ? fmtPrice(p.low) : "—"}</div>
          </div>
        </div>
        <div className="metrics" style={{ marginTop: 6 }}>
          <div>
            <div className="metric-k">Prev close</div>
            <div className="metric-v">₹{p ? fmtPrice(p.prevClose) : "—"}</div>
          </div>
          <div>
            <div className="metric-k">Range</div>
            <div className="metric-v">₹{p ? fmtPrice(Math.max(0, p.high - p.low)) : "—"}</div>
          </div>
          <div>
            <div className="metric-k">Volume</div>
            <div className="metric-v">{p ? compact(p.volume) : "—"}</div>
          </div>
        </div>
      </section>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm ghost grow" onClick={() => openAlert(p?.price || 0)}>
          <Icon name="bell" size={14} /> Alert
        </button>
        <button type="button" className="btn sm ghost grow" onClick={resetEntry}>
          <Icon name="refresh" size={14} /> Last price
        </button>
        <button type="button" className="btn sm ghost grow" disabled={!trigger} onClick={applyBreakout}>
          <Icon name="zap" size={14} /> Breakout close
        </button>
      </div>

      {held.length > 0 && (
        <div className="warn-box green">
          <Icon name="check" size={16} />
          <span>
            You hold {shares(held.reduce((a, x) => a + x.qty, 0))} of {inst.symbol} in the paper book ·{" "}
            <button type="button" className="link" onClick={() => navigate("/journal")}>open journal</button>
          </span>
        </div>
      )}

      <div className="section-head">
        <div className="section-title"><span className="dot" /> What the closes say</div>
        <span className="pill">{dataDate ? dateLabel(dataDate) : "daily"}</span>
      </div>

      <div className="glass card">
        {setupTags.length ? (
          <>
            <SetupPills setups={setupTags} />
            <div className="divider" />
            <SetupExplainer setups={setupTags} />
          </>
        ) : (
          <div className="small muted">
            No daily setup is firing on the latest complete close. That is information too: the edge is
            conditional, and there is no rule that says trade anyway.
          </div>
        )}
        {dailySetups && (
          <div className="metrics" style={{ marginTop: 14, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <div>
              <div className="metric-k">RSI 14</div>
              <div className="metric-v" style={{ fontSize: 13 }}>{dailySetups.numbers.rsi?.toFixed(1) ?? "—"}</div>
            </div>
            <div>
              <div className="metric-k">20d high</div>
              <div className="metric-v" style={{ fontSize: 13 }}>₹{fmtPrice(dailySetups.numbers.high20)}</div>
            </div>
            <div>
              <div className="metric-k">MA20</div>
              <div className="metric-v" style={{ fontSize: 13 }}>₹{fmtPrice(dailySetups.numbers.ma20)}</div>
            </div>
            <div>
              <div className="metric-k">ATR 5-min</div>
              <div className="metric-v" style={{ fontSize: 13 }}>₹{fmtPrice(atrAtEntry.value)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="section-head">
        <div className="section-title"><span className="dot" /> Plan the exit</div>
        <span className="tiny muted">entry {minutesLabel(entryMinutes)}</span>
      </div>

      <div className="glass card">
        <div className="form-grid">
          <Field label="Entry" hint={entrySource === "breakout" ? "opening-range breakout close" : entrySource === "custom" ? "your price" : "last traded price"}>
            <NumInput value={entry} onChange={(n) => { setEntry(n); setEntrySource("custom"); }} prefix="₹" min={0.05} />
          </Field>
          <Field label="Flat by" hint={`entries ${rules.noEntriesBefore}–${rules.noEntriesAfter}`}>
            <input className="input" value={rules.flatBy} readOnly aria-readonly="true" />
          </Field>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Stop rule</label>
          <Segmented ariaLabel="Stop rule" value={stopRule} onChange={changeStop} options={STOP_OPTIONS} />
        </div>

        {(stopRule === "pct" || stopRule === "atr" || stopRule === "price") && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <Field
              label={stopRule === "pct" ? "Percent under entry" : stopRule === "atr" ? "ATR multiple" : "Stop price"}
              hint={stopRule === "atr" ? `${atrAtEntry.bars} bars of 5-min data up to the entry` : undefined}
            >
              <NumInput
                value={stopParam}
                onChange={setStopParam}
                prefix={stopRule === "price" ? "₹" : undefined}
                suffix={stopRule === "pct" ? "%" : stopRule === "atr" ? "×" : undefined}
                min={0.01}
                step={0.05}
              />
            </Field>
            <Field label="Stop becomes" hint={STOP_LABELS[stopRule]}>
              <input className="input" value={plan ? `₹${fmtPrice(plan.stop)}` : "—"} readOnly aria-readonly="true" />
            </Field>
          </div>
        )}

        <div className="field" style={{ marginTop: 12 }}>
          <label>Target rule</label>
          <Segmented ariaLabel="Target rule" value={targetRule} onChange={changeTarget} options={TARGET_OPTIONS} />
        </div>

        {targetRule === "price" && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <Field label="Target price">
              <NumInput value={targetParam} onChange={setTargetParam} prefix="₹" min={0.05} />
            </Field>
            <Field label="Target in R" hint={TARGET_LABELS.price}>
              <input className="input" value={plan ? `${plan.targetR.toFixed(2)}R` : "—"} readOnly aria-readonly="true" />
            </Field>
          </div>
        )}

        {plan && (
          <>
            <div className="divider" />
            <KV k="Entry" v={`₹${fmtPrice(plan.entry)}`} />
            <KV k={`Stop · ${plan.stopLabel}`} v={`₹${fmtPrice(plan.stop)}`} tone="down" />
            <KV k={`Target · ${plan.targetLabel}`} v={`₹${fmtPrice(plan.target)}`} tone="up" />
            <KV k="Risk a share" v={`₹${fmtPrice(plan.riskPerShare)} · ${plan.riskPct.toFixed(2)}%`} />
            <KV k="Reward : risk" v={`${plan.rewardRisk.toFixed(2)} : 1`} tone={plan.rewardRisk >= rules.minRewardRisk ? "up" : "down"} />
            {plan.stopDetail && <div className="tiny muted" style={{ marginTop: 4 }}>{plan.stopDetail}</div>}
          </>
        )}

        {planCalc && "error" in planCalc && (
          <div className="warn-box red" style={{ marginTop: 12 }}>
            <Icon name="alert" size={16} />
            <span>{planCalc.error}</span>
          </div>
        )}

        {planWarnings.map((w) => (
          <div key={w} className="warn-box" style={{ marginTop: 10 }}>
            <Icon name="alert" size={16} />
            <span>{w}</span>
          </div>
        ))}

        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button type="button" className="btn sm ghost grow" onClick={sendToTM} disabled={!plan}>
            <Icon name="clock" size={14} /> Time Machine
          </button>
          <button type="button" className="btn sm ghost grow" onClick={() => openAlert(plan?.target || p?.price || 0)}>
            <Icon name="bell" size={14} /> Alert at target
          </button>
        </div>
      </div>

      <div className="section-head">
        <div className="section-title"><span className="dot" /> Size in rupees</div>
        {sizing && <span className="pill blue">{sizingLimitText(sizing)}</span>}
      </div>

      <div className="glass card">
        {sizing && plan ? (
          <>
            <div className="row between">
              <div>
                <div className="metric-k">Order</div>
                <div className="hero-price" style={{ fontSize: 30, marginTop: 2 }}>
                  {sizing.qty} <span style={{ fontSize: 15, color: "var(--ink-3)", fontWeight: 500 }}>shares</span>
                </div>
              </div>
              <div className="right">
                <div className="metric-k">Value</div>
                <div className="strong num" style={{ fontSize: 17 }}>{inr(sizing.cost, 0)}</div>
                <div className="tiny muted">at ₹{fmtPrice(plan.entry)}</div>
              </div>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <div className="grow">
                <Stat k="Max loss" v={inr(sizing.maxLoss, 0)} tone="down" sub={`limit ${inr(rules.maxLossPerTrade, 0)}`} />
              </div>
              <div className="grow">
                <Stat k="Cash left" v={inr(Math.max(0, cash - sizing.cost), 0)} sub={`buffer ${rules.cashBufferPct}%`} />
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="tbl">
                <thead>
                  <tr><th>Limit</th><th>Rupees</th><th>Shares</th></tr>
                </thead>
                <tbody>
                  {sizing.limits.map((l) => (
                    <tr key={l.name} className={l.binds ? "binds" : ""}>
                      <td className="nowrap">{l.name}{l.binds ? " · binds" : ""}</td>
                      <td>{inr(l.usd, 0)}</td>
                      <td>{l.shares}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sizing.refusal && (
              <div className="warn-box red" style={{ marginTop: 12 }}>
                <Icon name="alert" size={16} />
                <span>{sizing.refusal}</span>
              </div>
            )}
            <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
              Whole shares, ₹0.05 tick, and the smallest of the four limits wins. The 50% position cap and the{" "}
              {rules.cashBufferPct}% cash buffer are rules, not suggestions.
            </p>
          </>
        ) : (
          <Empty icon="scale" title="No valid plan yet">Fix the entry or the stop rule to size the order.</Empty>
        )}
      </div>

      <div className="section-head">
        <div className="section-title"><span className="dot" /> Risk gate</div>
        {risk && <span className={`pill ${risk.verdict === "PASS" ? "green" : "red"}`}>{risk.verdict}</span>}
      </div>

      <div className="glass card">
        {risk ? (
          <>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="small strong">
                {risk.verdict === "PASS" ? "The order clears every rule." : "The order is blocked. Nothing is sent."}
              </span>
              <span className="tiny muted">
                {risk.tradesToday} of {risk.tradesLimit} trades · {inr(risk.usedToday, 0)} of {inr(risk.lossLimit, 0)} at risk
              </span>
            </div>
            {risk.reasons.length > 0 && (
              <ul className="reason-list">
                {risk.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            {risk.warnings.map((w, i) => (
              <div key={`w${i}`} className="warn-box" style={{ marginTop: 8 }}>
                <Icon name="alert" size={15} /><span>{w}</span>
              </div>
            ))}
            {risk.verdict === "PASS" && risk.info.length > 0 && (
              <div className="col" style={{ gap: 5, marginTop: 6 }}>
                {risk.info.map((line, i) => (
                  <span key={i} className="tiny muted" style={{ lineHeight: 1.45 }}>{line}</span>
                ))}
              </div>
            )}
            <div className="divider" />
            <div className="row" style={{ gap: 6 }}>
              <Icon name="shield" size={15} style={{ color: risk.verdict === "PASS" ? "var(--green)" : "var(--red)" }} />
              <span className="tiny muted" style={{ lineHeight: 1.5 }}>
                The gate checks the stop, the loss at that stop, R:R, the daily loss, trade count, the entry
                window, cash, the buffer, duplicates and your blocked list.
              </span>
            </div>
          </>
        ) : (
          <div className="small muted">The gate needs a valid plan and a share quantity first.</div>
        )}
      </div>

      <div className="action-bar">
        <button type="button" className="btn ghost grow" onClick={() => navigate("/scan")}>
          <Icon name="back" size={15} /> Scan
        </button>
        <button type="button" className="btn primary grow" disabled={!canPlace} onClick={() => setOrderOpen(true)} style={{ flex: 1.4 }}>
          <Icon name="check" size={16} /> Place paper order
        </button>
      </div>
      {!canPlace && (
        <p className="tiny muted center" style={{ marginTop: -4 }}>
          {sizing?.refusal
            ? "Sizing refuses this order."
            : risk && risk.reasons.length
              ? "The risk gate is blocking. Read the reasons above."
              : "A valid plan is needed first."}
        </p>
      )}

      <Sheet
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        title="Paper order ticket"
        sub={`${inst.symbol} · ${inst.name}`}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => setOrderOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" onClick={placeOrder}>Confirm paper buy</button>
          </>
        }
      >
        {sizing && plan && (
          <>
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="pill green"><span className="live-dot" />Buy · paper</span>
              <span className="pill">{sizing.qty} shares</span>
            </div>
            <KV k="Entry (market)" v={`₹${fmtPrice(plan.entry)}`} />
            <KV k="Stop loss" v={`₹${fmtPrice(plan.stop)}`} tone="down" />
            <KV k="Take profit" v={`₹${fmtPrice(plan.target)}`} tone="up" />
            <KV k="Order value" v={inr(sizing.cost)} />
            <KV k="Max loss at stop" v={inr(sizing.maxLoss)} tone="down" />
            <KV k="Reward : risk" v={`${plan.rewardRisk.toFixed(2)} : 1`} />
            <KV k="Bracket" v="stop + target, day" />
            {bracketOrder(sizing, inst.symbol, setupTags[0] || "manual", minutesLabel(entryMinutes), rules.flatBy) && (
              <div className="warn-box" style={{ marginTop: 12 }}>
                <Icon name="info" size={16} />
                <span>
                  Bracketed for the paper book. Free NSE data cannot place a real order, and this app never
                  pretends to.
                </span>
              </div>
            )}
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Gate: PASS · {risk?.info[0] || ""}
            </p>
          </>
        )}
      </Sheet>

      <Sheet
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        title="Price alert"
        sub={`${inst.symbol} · paper price watcher`}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => setAlertOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" onClick={createAlert} disabled={!(alertPrice > 0)}>Set alert</button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Price">
            <NumInput value={alertPrice} onChange={setAlertPrice} prefix="₹" min={0.05} />
          </Field>
          <Field label="Direction">
            <Segmented
              ariaLabel="Alert direction"
              value={alertDir}
              onChange={setAlertDir}
              options={[
                { value: "above", label: "Above" },
                { value: "below", label: "Below" },
              ]}
            />
          </Field>
        </div>
        <p className="tiny muted" style={{ marginTop: 12 }}>
          Alerts are checked while the app is open and fire when the price crosses this level. A frozen
          snapshot never moves, so switch on the live feed for alerts to cross.
          {typeof Notification !== "undefined" && Notification.permission !== "granted"
            ? " Allow notifications in Settings for a system banner too."
            : ""}
        </p>
      </Sheet>

      <p className="tiny muted center" style={{ lineHeight: 1.6 }}>
        Snapshot {fmtDate(inst.quote.asOf)} · daily {inst.daily.length} bars · intraday {inst.intraday.length} bars on{" "}
        {dataDate ? dateLabel(dataDate, true) : "—"}.
        <br />
        {settings.mode === "live"
          ? "Live quotes from the public NSE feed · snapshot history from Yahoo Finance · paper only · not financial advice."
          : "Yahoo Finance NSE data · paper only · not financial advice."}
      </p>
    </div>
  );
}
