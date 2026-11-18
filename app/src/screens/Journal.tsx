import { useMemo, useState } from "react";
import { useApp, paperCash, realizedPnlToday } from "../lib/store";
import { useMarketClock } from "../lib/hooks";
import { priceOf } from "../lib/prices";
import { initials } from "../lib/market";
import { navigate, symbolPath } from "../router";
import { dateLabel, minutesLabel } from "../lib/time";
import { inr, pct, price as fmtPrice, shares, signedInr } from "../lib/format";
import { Icon } from "../components/Icons";
import { SeriesChart } from "../components/Chart";
import { Empty, KV, Loading, Stat, Segmented } from "../components/UI";
import { Sheet } from "../components/Sheet";
import { chime } from "../lib/feedback";

export function JournalScreen() {
  const market = useApp((s) => s.market);
  const rules = useApp((s) => s.rules);
  const settings = useApp((s) => s.settings);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const positions = useApp((s) => s.positions);
  const closedTrades = useApp((s) => s.closedTrades);
  const closePosition = useApp((s) => s.closePosition);
  const flattenAll = useApp((s) => s.flattenAll);
  const resetPaper = useApp((s) => s.resetPaper);
  const pushToast = useApp((s) => s.pushToast);
  const clock = useMarketClock();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [resetOpen, setResetOpen] = useState(false);

  const priceFor = (symbol: string) => {
    const inst = market?.symbols.find((s) => s.symbol === symbol);
    if (!inst) return 0;
    return priceOf(inst, market, settings.mode, replay, liveQuotes).price;
  };

  const cash = paperCash({ positions, closedTrades, rules });
  const openValue = positions.reduce((a, p) => a + p.qty * priceFor(p.symbol), 0);
  const equity = cash + openValue;
  const realized = closedTrades.reduce((a, t) => a + t.pnl, 0);
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl < 0);
  const winRate = closedTrades.length ? (wins.length / closedTrades.length) * 100 : 0;
  const avgR = closedTrades.length ? closedTrades.reduce((a, t) => a + t.r, 0) / closedTrades.length : 0;
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const pnlToday = realizedPnlToday({ closedTrades }, clock.dateStr);

  const curve = useMemo(() => {
    if (!closedTrades.length) return [];
    const sorted = closedTrades.slice().sort((a, b) => a.closedAt - b.closedAt);
    let run = rules.capital;
    const points = [{ x: sorted[0].closedAt - 1000, y: run, tip: `start · ${inr(run, 0)}` }];
    for (const t of sorted) {
      run += t.pnl;
      points.push({ x: t.closedAt, y: run, tip: `${dateLabel(t.date)} · ${inr(run, 0)}` });
    }
    return points;
  }, [closedTrades, rules.capital]);

  const curveTicks = useMemo(() => {
    if (curve.length < 2) return [];
    const picks = [0, Math.floor(curve.length / 2), curve.length - 1];
    return picks.map((i) => ({ x: curve[i].x, label: new Date(curve[i].x).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }));
  }, [curve]);

  const closeOne = (id: string, symbol: string) => {
    const px = priceFor(symbol);
    if (!px) return;
    const trade = closePosition(id, px);
    if (trade) {
      pushToast(`${symbol} closed at ₹${fmtPrice(px)} · ${signedInr(trade.pnl)} · ${trade.r > 0 ? "+" : ""}${trade.r.toFixed(2)}R`, trade.pnl >= 0 ? "green" : "red");
      chime(trade.pnl >= 0 ? "success" : "block", settings.sound);
    }
  };

  const flatten = () => {
    if (!positions.length) return;
    flattenAll((symbol) => priceFor(symbol) || 0);
    pushToast(`Flattened ${positions.length} paper position${positions.length === 1 ? "" : "s"} at the current prices.`, "amber");
    chime("alert", settings.sound);
  };

  if (!market) {
    return (
      <div className="page">
        <div className="page-head"><h1 className="page-title">Journal</h1></div>
        <div className="glass card"><Loading label="Loading the paper book…" /></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Journal</h1>
          <div className="page-sub">Paper book · {rules.capital ? inr(rules.capital, 0) : "—"} starting capital</div>
        </div>
        <span className={`pill ${pnlToday > 0 ? "green" : pnlToday < 0 ? "red" : ""}`}>
          today {pnlToday === 0 ? "flat" : signedInr(pnlToday)}
        </span>
      </div>

      <div className="glass card pad-lg">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="hero-label">Paper equity</div>
            <div className="hero-price" style={{ fontSize: 34 }}>{inr(equity, 0)}</div>
            <div className="hero-delta" style={{ color: realized >= 0 ? "var(--green)" : "var(--red)" }}>
              {signedInr(realized)} <span className="tiny muted">realized</span>
            </div>
          </div>
          <div className="col right" style={{ gap: 4 }}>
            <span className="tiny muted">cash</span>
            <span className="small strong num">{inr(cash, 0)}</span>
            <span className="tiny muted">open</span>
            <span className="small strong num">{inr(openValue, 0)}</span>
          </div>
        </div>

        {curve.length > 1 ? (
          <div style={{ marginTop: 10, marginLeft: -4, marginRight: -4 }}>
            <SeriesChart
              points={curve}
              height={148}
              color={realized >= 0 ? "var(--green)" : "var(--red)"}
              bands={[{ value: rules.capital, color: "rgba(238,242,255,0.28)", label: "start" }]}
              xTicks={curveTicks}
              yFmt={(n) => `₹${Math.round(n / 1000)}k`}
            />
          </div>
        ) : (
          <p className="tiny muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            The equity curve appears after the first closed trade. Open positions show below; every fill is paper.
          </p>
        )}

        <div className="metrics" style={{ marginTop: 10 }}>
          <div>
            <div className="metric-k">Trades</div>
            <div className="metric-v">{closedTrades.length}</div>
          </div>
          <div>
            <div className="metric-k">Win rate</div>
            <div className="metric-v">{closedTrades.length ? pct(winRate, 0) : "—"}</div>
          </div>
          <div>
            <div className="metric-k">Avg R</div>
            <div className="metric-v" style={{ color: avgR >= 0 ? "var(--green)" : "var(--red)" }}>
              {closedTrades.length ? `${avgR > 0 ? "+" : ""}${avgR.toFixed(2)}` : "—"}
            </div>
          </div>
        </div>
      </div>

      <Segmented
        ariaLabel="Journal view"
        value={tab}
        onChange={setTab}
        options={[
          { value: "open", label: `Open ${positions.length}` },
          { value: "closed", label: `Closed ${closedTrades.length}` },
        ]}
      />

      {tab === "open" ? (
        <div className="glass list">
          {positions.length ? (
            positions.map((p) => {
              const px = priceFor(p.symbol);
              const unreal = (px - p.entry) * p.qty;
              const toTarget = p.target > p.entry ? Math.max(0, Math.min(1, (px - p.entry) / (p.target - p.entry))) : 0;
              const rNow = p.riskPerShare > 0 ? (px - p.entry) / p.riskPerShare : 0;
              return (
                <div key={p.id} style={{ padding: "13px 16px", borderTop: "1px solid rgba(255,255,255,0.055)" }}>
                  <div className="row" style={{ gap: 10 }}>
                    <button type="button" className="sym-badge" onClick={() => navigate(symbolPath(p.symbol))} aria-label={`Open ${p.symbol}`}>
                      {initials(p.symbol)}
                    </button>
                    <button type="button" className="col grow" style={{ gap: 2, textAlign: "left" }} onClick={() => navigate(symbolPath(p.symbol))}>
                      <span className="sym-name">{p.symbol}</span>
                      <span className="sym-meta">
                        {shares(p.qty)} @ ₹{fmtPrice(p.entry)} · {dateLabel(p.date)} {minutesLabel(p.entryTime)}
                      </span>
                    </button>
                    <div className="col right" style={{ gap: 2 }}>
                      <span className="num strong">₹{fmtPrice(px)}</span>
                      <span className={`tiny ${unreal >= 0 ? "up" : "down"}`}>
                        {unreal >= 0 ? "+" : "−"}₹{Math.abs(unreal).toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn xs ghost"
                      onClick={() => closeOne(p.id, p.symbol)}
                      aria-label={`Close ${p.symbol}`}
                    >
                      Close
                    </button>
                  </div>
                  <div className="row between" style={{ marginTop: 8, gap: 8 }}>
                    <span className="tiny down">stop ₹{fmtPrice(p.stop)}</span>
                    <div className="bar" style={{ flex: 1 }}>
                      <i style={{ width: `${toTarget * 100}%` }} />
                    </div>
                    <span className="tiny up">target ₹{fmtPrice(p.target)}</span>
                  </div>
                  <div className="row between" style={{ marginTop: 4 }}>
                    <span className="tiny muted">{rNow > 0 ? "+" : ""}{rNow.toFixed(2)}R now</span>
                    <span className="tiny muted">risk {inr(p.maxLoss, 0)}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <Empty
              icon="journal"
              title="No open paper positions"
              action={<button type="button" className="btn primary" onClick={() => navigate("/scan")}>Find a setup</button>}
            >
              A plan becomes a position only after the sizing and the risk gate both pass. That is the point.
            </Empty>
          )}
        </div>
      ) : (
        <div className="glass list">
          {closedTrades.length ? (
            closedTrades.map((t) => (
              <div key={t.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <div className="sym-badge">{initials(t.symbol)}</div>
                <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="sym-name">{t.symbol}</span>
                    <span className={`pill ${t.outcome === "target" ? "green" : t.outcome === "stop" ? "red" : "amber"}`}>
                      {t.outcome}
                    </span>
                  </div>
                  <span className="sym-meta">
                    {shares(t.qty)} · ₹{fmtPrice(t.entry)} → ₹{fmtPrice(t.exit)} · {dateLabel(t.date)}
                  </span>
                </div>
                <div className="col right" style={{ gap: 3 }}>
                  <span className={`num strong ${t.pnl >= 0 ? "up" : "down"}`}>{signedInr(t.pnl)}</span>
                  <span className={`tiny ${t.r >= 0 ? "up" : "down"}`}>{t.r > 0 ? "+" : ""}{t.r.toFixed(2)}R</span>
                </div>
              </div>
            ))
          ) : (
            <Empty icon="journal" title="No closed trades yet">
              Closed trades land here with their R multiple, so the journal measures the process, not the mood.
            </Empty>
          )}
        </div>
      )}

      {(positions.length > 0 || closedTrades.length > 0) && (
        <div className="glass card tight">
          <div className="row between">
            <div className="col" style={{ gap: 2 }}>
              <span className="small strong">Process stats</span>
              <span className="tiny muted">from {closedTrades.length} closed trades</span>
            </div>
            <span className="pill">{profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)} PF</span>
          </div>
          <div className="divider" />
          <KV k="Wins / losses" v={`${wins.length} / ${losses.length}`} />
          <KV k="Gross win" v={inr(grossWin)} tone="up" />
          <KV k="Gross loss" v={inr(grossLoss)} tone="down" />
          <KV k="Average R" v={`${avgR > 0 ? "+" : ""}${avgR.toFixed(2)}`} />
          <KV k="Daily loss used" v={`${inr(Math.max(0, -pnlToday), 0)} of ${inr(rules.maxDailyLoss, 0)}`} />
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn ghost grow" onClick={flatten} disabled={!positions.length}>
          Flat everything
        </button>
        <button type="button" className="btn ghost grow" onClick={() => setResetOpen(true)} disabled={!positions.length && !closedTrades.length}>
          Reset paper book
        </button>
      </div>

      <p className="tiny muted center" style={{ lineHeight: 1.6 }}>
        Every fill is paper, priced from the real NSE snapshot or the replay clock. Nothing here reaches a broker.
      </p>

      <Sheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the paper book?"
        sub="Positions, closed trades and alerts go back to empty. Rules are kept."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => setResetOpen(false)}>Keep it</button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                resetPaper();
                setResetOpen(false);
                pushToast("Paper book reset. The rules and settings are unchanged.", "amber");
              }}
            >
              Reset
            </button>
          </>
        }
      >
        <div className="warn-box red">
          <Icon name="alert" size={16} />
          <span>This cannot be undone. The starting capital and every rule stay exactly as set.</span>
        </div>
      </Sheet>
    </div>
  );
}
