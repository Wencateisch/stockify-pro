import { useMemo } from "react";
import { useApp, paperCash, lossAtRiskToday, realizedPnlToday, tradesToday } from "../lib/store";
import { useMarketClock, useNow, usePricePoint } from "../lib/hooks";
import { scanOrb } from "../lib/orb";
import { scanDaily, SETUP_LABELS } from "../lib/indicators";
import { intradayProxy, tapeBreadth, sparkValues, initials, movers } from "../lib/market";
import { priceOf } from "../lib/prices";
import { navigate } from "../router";
import { OPEN_MIN, todayIst, istParts, minutesLabel, istClockStr } from "../lib/time";
import { inr, pct, price as fmtPrice, shares } from "../lib/format";
import { Icon } from "../components/Icons";
import { IstStamp } from "../components/IstClock";
import { GoLiveButton, LiveRefreshStatus } from "../components/LiveControls";
import { SeriesChart, Sparkline } from "../components/Chart";
import { SetupPills } from "../components/SetupPills";
import { Empty, Loading, Stat } from "../components/UI";
import type { Instrument } from "../lib/types";

const OR_MINUTES = 15;

export function DeskScreen() {
  const market = useApp((s) => s.market);
  const loading = useApp((s) => s.marketLoading);
  const error = useApp((s) => s.marketError);
  const load = useApp((s) => s.loadMarketData);
  const rules = useApp((s) => s.rules);
  const settings = useApp((s) => s.settings);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const liveSeries = useApp((s) => s.liveSeries);
  const watchlist = useApp((s) => s.watchlist);
  const positions = useApp((s) => s.positions);
  const closedTrades = useApp((s) => s.closedTrades);
  const startReplay = useApp((s) => s.startReplay);
  const pushToast = useApp((s) => s.pushToast);
  const clock = useMarketClock();
  const now = useNow(30_000);
  void now;

  const proxy = useMemo(() => intradayProxy(market), [market]);
  const breadth = useMemo(() => tapeBreadth(market), [market]);
  const live = useMemo(() => {
    const qs = Object.values(liveQuotes).filter((q) => q.prevClose > 0 && q.price > 0);
    if (!qs.length) return null;
    let up = 0;
    let down = 0;
    let flat = 0;
    let sum = 0;
    let turnover = 0;
    let asOf = 0;
    for (const q of qs) {
      const r = q.price / q.prevClose - 1;
      if (r > 0.0002) up++;
      else if (r < -0.0002) down++;
      else flat++;
      sum += r;
      turnover += q.price * (q.volume || 0);
      asOf = Math.max(asOf, q.asOf || 0);
    }
    const avg = sum / qs.length;
    return { up, down, flat, avgPct: avg * 100, turnover, count: qs.length, asOf, level: 10_000 * (1 + avg) };
  }, [liveQuotes]);
  const liveOn = settings.mode === "live" && !replay && !!live && live.count >= 10;
  const shown = liveOn && live ? live : breadth;
  const shownLevel = liveOn && live ? live.level : proxy.level;
  const shownPct = liveOn && live ? live.avgPct : proxy.lastPct;
  const orb = useMemo(
    () => (market ? scanOrb(market.symbols, OR_MINUTES, 15 * 60 + 30) : null),
    [market],
  );
  const daily = useMemo(() => (market ? scanDaily(market.symbols) : []), [market]);
  const gainers = useMemo(() => movers(market, "up", 4), [market]);
  const losers = useMemo(() => movers(market, "down", 4), [market]);

  const today = clock.dateStr;
  const cash = paperCash({ positions, closedTrades, rules });
  const openValue = positions.reduce((a, p) => {
    const inst = market?.symbols.find((s) => s.symbol === p.symbol);
    const p0 = inst ? priceOf(inst, market, settings.mode, replay, liveQuotes).price : p.entry;
    return a + p0 * p.qty;
  }, 0);
  const equity = cash + openValue;
  const riskToday = lossAtRiskToday({ positions, closedTrades }, today);
  const pnlToday = realizedPnlToday({ closedTrades }, today);
  const entriesToday = tradesToday({ positions, closedTrades }, today);

  if (!market) {
    if (loading) {
      return (
        <div className="page">
          <div className="page-head">
            <div>
              <h1 className="page-title">The desk</h1>
              <div className="page-sub">Loading the Nifty 50 snapshot…</div>
            </div>
          </div>
          <div className="glass card">
            <Loading label="Reading 50 symbols and 59 sessions" />
          </div>
        </div>
      );
    }
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">The desk</h1>
        </div>
        <div className="glass card">
          <Empty
            icon="alert"
            title="The snapshot did not load"
            action={
              <button type="button" className="btn primary" onClick={() => void load()}>
                Try again
              </button>
            }
          >
            {error || "The bundled market snapshot is missing."}
          </Empty>
        </div>
      </div>
    );
  }

  const heroUp = shownPct >= 0;
  const heroColor = heroUp ? "var(--green)" : "var(--red)";
  const livePoints = liveSeries.map((pt) => {
    const parts = istParts(pt.t);
    const move = (pt.value / 10_000 - 1) * 100;
    return {
      x: parts.minutes,
      y: move,
      tip: `${minutesLabel(parts.minutes)} · ${pct(move)}`,
    };
  });
  const points = liveOn
    ? livePoints
    : proxy.points.map((p) => ({
        x: p.minutes,
        y: p.pct,
        tip: `${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(p.minutes % 60).padStart(2, "0")} · ${pct(p.pct)}`,
      }));
  const tickSource = liveOn ? livePoints : proxy.points.map((p) => ({ x: p.minutes }));
  const xTicks = tickSource.length
    ? [...new Set([0, Math.floor((tickSource.length - 1) / 2), tickSource.length - 1])].map((idx) => {
        const m = tickSource[idx].x;
        return { x: m, label: minutesLabel(m) };
      })
    : [];
  const liveClock = live?.asOf ? istClockStr(live.asOf) : "";

  const topHit = orb?.hits[0];
  const breadthPct = (shown.up / Math.max(1, shown.count)) * 100;
  const tapeLabel = proxy.date
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
        new Date(proxy.date + "T12:00:00+05:30"),
      )
    : "";

  const startReplaySession = () => {
    if (!proxy.date) {
      pushToast("No intraday session in the snapshot to replay.", "amber");
      return;
    }
    startReplay(proxy.date, OPEN_MIN);
    pushToast("Replay loaded at 09:15. Press play in the replay bar.", "info");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">The desk</h1>
          <div className="page-sub">
            {new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(
              new Date(clock.dateStr + "T12:00:00+05:30"),
            )}{" "}
            · {market.symbols.length} Nifty 50 names · paper only
          </div>
        </div>
      </div>

      <section className="glass card pad-lg hero">
        <div className="hero-top">
          <div className="grow">
            <div className="hero-label">
              {liveOn
                ? `Nifty 50 · equal-weight proxy · live${liveClock ? ` · ${liveClock} IST` : ""}`
                : `Nifty 50 · equal-weight proxy${tapeLabel ? ` · ${tapeLabel}` : ""}`}
            </div>
            <div className="hero-price">{shownLevel.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="hero-delta" style={{ color: heroColor }}>
              <span>
                {pct(shownPct)}
              </span>
              <span className="tiny muted">
                vs prev close · {shown.up} up / {shown.down} down
              </span>
            </div>
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 6 }}>
            <span className={`pill ${liveOn ? "green" : ""}`}>
              {liveOn ? `Live · ${live?.count ?? 0} quotes` : "Last complete session"}
            </span>
            <span className="pill blue">base = 10,000</span>
          </div>
        </div>

        <div className="hero-chart">
          <SeriesChart
            points={points}
            height={170}
            color={heroColor}
            bands={[{ value: 0, color: "rgba(238,242,255,0.28)", label: "prev close", dashed: true }]}
            xTicks={xTicks}
            yFmt={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`}
            minSpan={0.35}
          />
        </div>

        <div className="metrics">
          <div>
            <div className="metric-k">Advances</div>
            <div className="metric-v up">{shown.up}</div>
          </div>
          <div>
            <div className="metric-k">Declines</div>
            <div className="metric-v down">{shown.down}</div>
          </div>
          <div>
            <div className="metric-k">Avg move</div>
            <div className="metric-v" style={{ color: shown.avgPct >= 0 ? "var(--green)" : "var(--red)" }}>
              {pct(shown.avgPct)}
            </div>
          </div>
        </div>

        <div className="bar" style={{ marginTop: 12 }}>
          <i style={{ width: `${Math.max(2, Math.min(100, breadthPct))}%` }} />
        </div>
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="tiny muted">{shown.flat} unchanged</span>
          <span className="tiny muted">
            Turnover ≈ ₹{(shown.turnover / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr
          </span>
        </div>
      </section>

      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="btn primary grow" onClick={() => navigate("/scan")}>
          <Icon name="radar" size={17} /> Run the scan
        </button>
        <button type="button" className="btn ghost grow" onClick={startReplaySession}>
          <Icon name="play" size={15} /> Replay session
        </button>
      </div>

      <div className="glass card tight">
        <div className="row between">
          <div className="row" style={{ gap: 9 }}>
            <Icon name="clock" size={17} style={{ color: clock.allowEntries ? "var(--green)" : "var(--amber)" }} />
            <div className="col">
              <span className="small strong">{clock.detail}</span>
              <span className="tiny muted">
                Session {market.session.date} · entries {rules.noEntriesBefore}–{rules.noEntriesAfter} · flat by {rules.flatBy}
              </span>
            </div>
          </div>
          <span className={`pill ${clock.allowEntries ? "green" : "amber"}`}>{clock.allowEntries ? "Entry window" : "No entries"}</span>
        </div>
        {settings.mode === "live" ? (
          <div className="col" style={{ marginTop: 8, gap: 4 }}>
            <span className="tiny muted">
              {liveOn
                ? `Live proxy from ${live?.count ?? 0} of ${market.symbols.length} quotes${liveClock ? ` · last tick ${liveClock} IST` : ""}`
                : settings.liveSource === "direct"
                  ? "Connecting to the public NSE feed…"
                  : `Connecting to ${settings.serverUrl}…`}
            </span>
            <LiveRefreshStatus bar />
            {liveOn && liveSeries.length < 2 && (
              <span className="tiny muted">The live line starts now — one point per poll, so it fills in within a minute.</span>
            )}
          </div>
        ) : (
          <div className="row between" style={{ marginTop: 8, gap: 8 }}>
            <span className="tiny muted">
              Showing the bundled snapshot. Live NSE quotes are one tap away — no server needed.
            </span>
            <GoLiveButton />
          </div>
        )}
      </div>

      <div className="section-head">
        <div className="section-title">
          <span className="dot" /> Opening range · {tapeLabel || "—"} · first {OR_MINUTES} min
        </div>
        <button type="button" className="link" onClick={() => navigate("/scan")}>
          All {orb ? orb.hits.length : 0}
        </button>
      </div>

      <div className="glass list">
        {orb && orb.hits.length ? (
          orb.hits.slice(0, 3).map((hit) => {
            const inst = market.symbols.find((s) => s.symbol === hit.symbol);
            const p = inst ? priceOf(inst, market, settings.mode, replay, liveQuotes) : null;
            return (
              <button
                key={hit.symbol}
                type="button"
                className="list-row press"
                onClick={() => navigate(`/s/${encodeURIComponent(hit.symbol)}`)}
              >
                <div className="sym-badge">{initials(hit.symbol)}</div>
                <div className="col grow" style={{ gap: 3 }}>
                  <span className="sym-name">{hit.symbol}</span>
                  <span className="sym-meta">
                    broke {String(Math.floor(hit.closeAt / 60)).padStart(2, "0")}:{String(hit.closeAt % 60).padStart(2, "0")} ·{" "}
                    {pct(hit.pctOver)} over ₹{fmtPrice(hit.orHigh)}
                  </span>
                </div>
                <div className="col right" style={{ gap: 3 }}>
                  <span className="num strong">{p ? `₹${fmtPrice(p.price)}` : "—"}</span>
                  <span className={`tiny ${p && p.changePct >= 0 ? "up" : "down"}`}>{p ? pct(p.changePct) : ""}</span>
                </div>
                <Icon name="chevron" size={16} style={{ color: "var(--ink-4)" }} />
              </button>
            );
          })
        ) : (
          <Empty icon="target" title="No opening-range breakout yet">
            The first completed 5-minute bar has not closed above the 09:15–09:30 range high on this
            session. The scan tab shows every name still watching its range.
          </Empty>
        )}
      </div>

      <div className="section-head">
        <div className="section-title">
          <span className="dot" /> Daily setups · latest complete close
        </div>
        <button type="button" className="link" onClick={() => navigate("/scan")}>
          {daily.length} hits
        </button>
      </div>

      <div className="glass list">
        {daily.length ? (
          daily.slice(0, 4).map((hit) => {
            const inst = market.symbols.find((s) => s.symbol === hit.symbol) || null;
            return (
              <button
                key={hit.symbol}
                type="button"
                className="list-row press"
                onClick={() => navigate(`/s/${encodeURIComponent(hit.symbol)}`)}
              >
                <div className="col" style={{ gap: 5, flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="sym-name">{hit.symbol}</span>
                    <span className={`tiny ${hit.changePct >= 0 ? "up" : "down"}`}>{pct(hit.changePct)}</span>
                  </div>
                  <SetupPills setups={hit.setups} max={2} />
                </div>
                <Sparkline values={sparkValues(inst)} />
                <div className="col right" style={{ gap: 3 }}>
                  <span className="num strong">₹{fmtPrice(hit.price)}</span>
                  <span className="tiny muted">RSI {hit.rsi ?? "—"}</span>
                </div>
              </button>
            );
          })
        ) : (
          <Empty icon="radar" title="No daily setup fired">
            None of the five daily setups matched on the latest complete close. That is a valid answer.
          </Empty>
        )}
      </div>

      {(positions.length > 0 || closedTrades.length > 0) && (
        <>
          <div className="section-head">
            <div className="section-title">
              <span className="dot" /> Paper book
            </div>
            <button type="button" className="link" onClick={() => navigate("/journal")}>
              Journal
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="grow">
              <Stat k="Equity" v={inr(equity, 0)} sub={`cash ${inr(cash, 0)}`} />
            </div>
            <div className="grow">
              <Stat
                k="Today"
                v={pnlToday === 0 ? "—" : `${pnlToday > 0 ? "+" : "−"}${inr(Math.abs(pnlToday), 0)}`}
                tone={pnlToday > 0 ? "up" : pnlToday < 0 ? "down" : undefined}
                sub={`${entriesToday} of ${rules.maxTradesPerDay} entries`}
              />
            </div>
            <div className="grow">
              <Stat k="At risk" v={inr(riskToday, 0)} tone="amber" sub={`limit ${inr(rules.maxDailyLoss, 0)}`} />
            </div>
          </div>

          {positions.length > 0 && (
            <div className="glass list">
              {positions.slice(0, 4).map((p) => {
                const inst = market.symbols.find((s) => s.symbol === p.symbol);
                const p0 = inst ? priceOf(inst, market, settings.mode, replay, liveQuotes).price : p.entry;
                const up = (p0 - p.entry) * p.qty;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="list-row press"
                    onClick={() => navigate(`/s/${encodeURIComponent(p.symbol)}`)}
                  >
                    <div className="sym-badge">{initials(p.symbol)}</div>
                    <div className="col grow" style={{ gap: 3 }}>
                      <span className="sym-name">{p.symbol}</span>
                      <span className="sym-meta">
                        {shares(p.qty)} @ ₹{fmtPrice(p.entry)} · stop ₹{fmtPrice(p.stop)}
                      </span>
                    </div>
                    <div className="col right" style={{ gap: 3 }}>
                      <span className="num strong">₹{fmtPrice(p0)}</span>
                      <span className={`tiny ${up >= 0 ? "up" : "down"}`}>
                        {up >= 0 ? "+" : "−"}₹{Math.abs(up).toFixed(2)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="section-head">
        <div className="section-title">
          <span className="dot" /> Watchlist
        </div>
        <button type="button" className="link" onClick={() => navigate("/scan")}>
          Add names
        </button>
      </div>
      <div className="glass list">
        {(watchlist.length ? watchlist : ["RELIANCE"]).slice(0, 6).map((sym) => {
          const inst = market.symbols.find((s) => s.symbol === sym);
          if (!inst) return null;
          return <WatchRow key={sym} inst={inst} />;
        })}
      </div>

      <div className="row" style={{ gap: 10 }}>
        <div className="glass flat card tight grow">
          <div className="metric-k">Top gainer</div>
          {gainers[0] ? (
            <button type="button" className="tap-row" style={{ marginTop: 4 }} onClick={() => navigate(`/s/${gainers[0].symbol}`)}>
              <div className="col grow" style={{ gap: 1 }}>
                <span className="small strong">{gainers[0].symbol}</span>
                <span className="tiny muted truncate">{gainers[0].name}</span>
              </div>
              <span className="up small strong">{pct(gainers[0].quote.changePct)}</span>
            </button>
          ) : (
            <span className="muted small">—</span>
          )}
        </div>
        <div className="glass flat card tight grow">
          <div className="metric-k">Top loser</div>
          {losers[0] ? (
            <button type="button" className="tap-row" style={{ marginTop: 4 }} onClick={() => navigate(`/s/${losers[0].symbol}`)}>
              <div className="col grow" style={{ gap: 1 }}>
                <span className="small strong">{losers[0].symbol}</span>
                <span className="tiny muted truncate">{losers[0].name}</span>
              </div>
              <span className="down small strong">{pct(losers[0].quote.changePct)}</span>
            </button>
          ) : (
            <span className="muted small">—</span>
          )}
        </div>
      </div>

      <p className="tiny muted center" style={{ lineHeight: 1.6, padding: "4px 8px 0" }}>
        {market.source}. <IstStamp ts={Date.parse(market.generatedAt)} label="Snapshot" />. Intraday session{" "}
        {proxy.date || "—"}.
        <br />
        Equal-weight proxy, not the NIFTY 50 index. Every order is paper. Not financial advice.
      </p>
    </div>
  );
}

function WatchRow({ inst }: { inst: Instrument }) {
  const settings = useApp((s) => s.settings);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const market = useApp((s) => s.market);
  const p = usePricePoint(inst);
  const p0 = p || priceOf(inst, market, settings.mode, replay, liveQuotes);
  return (
    <button type="button" className="list-row press" onClick={() => navigate(`/s/${encodeURIComponent(inst.symbol)}`)}>
      <div className="sym-badge">{initials(inst.symbol)}</div>
      <div className="col grow" style={{ gap: 2 }}>
        <span className="sym-name">{inst.symbol}</span>
        <span className="sym-meta truncate">{inst.name}</span>
      </div>
      <Sparkline values={sparkValues(inst)} width={62} height={26} />
      <div className="col right" style={{ gap: 2 }}>
        <span className="num strong">₹{fmtPrice(p0.price)}</span>
        <span className={`tiny ${p0.changePct >= 0 ? "up" : "down"}`}>{pct(p0.changePct)}</span>
      </div>
      <Icon name="chevron" size={15} style={{ color: "var(--ink-4)" }} />
    </button>
  );
}

export function setupLabel(key: keyof typeof SETUP_LABELS): string {
  return SETUP_LABELS[key];
}
