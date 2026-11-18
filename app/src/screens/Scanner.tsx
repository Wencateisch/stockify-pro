import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { scanDaily, SETUP_LABELS, SETUP_ORDER } from "../lib/indicators";
import { scanOrb, type OrbScan } from "../lib/orb";
import { initials, intradayTapeDate, sparkValues } from "../lib/market";
import { navigate } from "../router";
import { CLOSE_MIN, minutesLabel, OPEN_MIN } from "../lib/time";
import { pct, price as fmtPrice } from "../lib/format";
import { Sparkline } from "../components/Chart";
import { SetupPills } from "../components/SetupPills";
import { Empty, Loading, Segmented } from "../components/UI";
import { Icon } from "../components/Icons";
import { IstStamp } from "../components/IstClock";
import type { SetupKey } from "../lib/types";

const CUTOFFS = [OPEN_MIN + 30, 10 * 60 + 30, 12 * 60, CLOSE_MIN];

export function ScannerScreen() {
  const market = useApp((s) => s.market);
  const loading = useApp((s) => s.marketLoading);
  const [tab, setTab] = useState<"daily" | "orb">("daily");
  const [setup, setSetup] = useState<SetupKey | "all">("all");
  const [q, setQ] = useState("");
  const [cutoff, setCutoff] = useState(CLOSE_MIN);

  const daily = useMemo(() => (market ? scanDaily(market.symbols) : []), [market]);
  const tapeDate = useMemo(() => intradayTapeDate(market), [market]);
  const orb: OrbScan | null = useMemo(
    () => (market ? scanOrb(market.symbols, 15, cutoff) : null),
    [market, cutoff],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const hit of daily) for (const s of hit.setups) c[s] = (c[s] || 0) + 1;
    return c;
  }, [daily]);

  const filteredDaily = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return daily.filter((h) => {
      if (setup !== "all" && !h.setups.includes(setup)) return false;
      if (!needle) return true;
      const inst = market?.symbols.find((s) => s.symbol === h.symbol);
      return h.symbol.includes(needle) || (inst ? inst.name.toUpperCase().includes(needle) : false);
    });
  }, [daily, setup, q, market]);

  const filteredOrb = useMemo(() => {
    if (!orb) return { hits: [], watched: [] };
    const needle = q.trim().toUpperCase();
    const match = (sym: string) => {
      if (!needle) return true;
      if (sym.includes(needle)) return true;
      const inst = market?.symbols.find((s) => s.symbol === sym);
      return inst ? inst.name.toUpperCase().includes(needle) : false;
    };
    return {
      hits: orb.hits.filter((h) => match(h.symbol)),
      watched: orb.watched.filter((w) => match(w.symbol)),
    };
  }, [orb, q, market]);

  if (!market) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Scanner</h1>
        </div>
        <div className="glass card">
          {loading ? <Loading label="Loading the Nifty 50 snapshot…" /> : <Empty title="No market data" icon="alert">Reload the desk to fetch the bundled snapshot.</Empty>}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Scanner</h1>
          <div className="page-sub">Five daily setups and the opening-range breakout · {market.symbols.length} names</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            <IstStamp ts={Date.parse(market.generatedAt)} label="Snapshot taken" />
          </div>
        </div>
        <span className="pill">{daily.length} daily</span>
      </div>

      <Segmented
        ariaLabel="Scan type"
        value={tab}
        onChange={setTab}
        options={[
          { value: "daily", label: "Daily setups" },
          { value: "orb", label: "Opening range" },
        ]}
      />

      <div className="input-affix">
        <span style={{ display: "grid", placeItems: "center", top: 0, height: 42, transform: "none" }}>
          <Icon name="search" size={15} />
        </span>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search symbol or company"
          autoComplete="off"
          spellCheck={false}
          style={{ paddingLeft: 32 }}
        />
      </div>

      {tab === "daily" ? (
        <>
          <div className="hstack-scroll">
            <button type="button" className={`chip ${setup === "all" ? "on" : ""}`} onClick={() => setSetup("all")}>
              All <span className="count">{daily.length}</span>
            </button>
            {SETUP_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${setup === s ? "on" : ""}`}
                onClick={() => setSetup(setup === s ? "all" : s)}
              >
                {SETUP_LABELS[s]} <span className="count">{counts[s] || 0}</span>
              </button>
            ))}
          </div>

          <div className="glass list">
            {filteredDaily.length ? (
              filteredDaily.map((hit) => {
                const inst = market.symbols.find((s) => s.symbol === hit.symbol) || null;
                return (
                  <button
                    key={hit.symbol}
                    type="button"
                    className="list-row press"
                    onClick={() => navigate(`/s/${encodeURIComponent(hit.symbol)}`)}
                  >
                    <div className="sym-badge">{initials(hit.symbol)}</div>
                    <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="sym-name">{hit.symbol}</span>
                        {hit.setups.length > 1 && <span className="badge">{hit.setups.length} setups</span>}
                      </div>
                      <SetupPills setups={hit.setups} max={2} />
                    </div>
                    <Sparkline values={sparkValues(inst)} width={58} height={26} />
                    <div className="col right" style={{ gap: 3 }}>
                      <span className="num strong">₹{fmtPrice(hit.price)}</span>
                      <span className={`tiny ${hit.changePct >= 0 ? "up" : "down"}`}>{pct(hit.changePct)}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <Empty
                icon="radar"
                title={q ? "Nothing matches that search" : "No setup matches this filter"}
              >
                {q
                  ? "Try a shorter symbol or clear the search."
                  : "The scan only reports what the closes actually did. Pick another setup or All."}
              </Empty>
            )}
          </div>

          <div className="glass card tight">
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="metric-k">Rule detail</span>
              <span className="tiny muted">{market.session.date} close</span>
            </div>
            <div className="col" style={{ gap: 7 }}>
              {SETUP_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="row between"
                  style={{ textAlign: "left", gap: 10 }}
                  onClick={() => setSetup(s)}
                >
                  <span className="tiny" style={{ color: "var(--ink-2)" }}>{SETUP_LABELS[s]}</span>
                  <span className="badge">{counts[s] || 0}</span>
                </button>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
              All five read completed daily closes. The in-progress bar is dropped when the snapshot was taken
              before 15:30 IST, so the scan never sees a half-formed candle.
            </p>
          </div>
        </>
      ) : (
        <>
          <Segmented
            ariaLabel="Scan cutoff"
            value={cutoff}
            onChange={setCutoff}
            options={CUTOFFS.map((m) => ({ value: m, label: minutesLabel(m) }))}
          />

          <div className="glass card tight">
            <div className="row between">
              <div className="col" style={{ gap: 2 }}>
                <span className="small strong">
                  Range 09:15–09:30 · {tapeDate ? `${tapeDate} tape` : "15 minutes"}
                </span>
                <span className="tiny muted">
                  Entry = first completed 5-minute bar closing above the range high, up to {minutesLabel(cutoff)}.
                </span>
              </div>
              <span className="pill green">{orb?.hits.length || 0} hits</span>
            </div>
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="tiny muted">{orb?.scanned || 0} symbols with a complete range</span>
              <span className="tiny muted">{orb?.unusable || 0} without one</span>
            </div>
            {orb && orb.patchy > 0 && (
              <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
                Yahoo's NSE tape drops the odd 5-minute print (usually 15:20): {orb.patchy} of {orb.scanned}{" "}
                sessions carry {orb.gaps} missing bar{orb.gaps === 1 ? "" : "s"}. The 09:15–09:30 range itself is
                complete in every one; the scan uses the prints that exist and never invents one.
              </div>
            )}
          </div>

          <div className="section-head">
            <div className="section-title">
              <span className="dot" /> Breakouts
            </div>
            <span className="tiny muted">{filteredOrb.hits.length} shown</span>
          </div>

          <div className="glass list">
            {filteredOrb.hits.length ? (
              filteredOrb.hits.map((hit) => {
                const inst = market.symbols.find((s) => s.symbol === hit.symbol);
                return (
                  <button
                    key={hit.symbol}
                    type="button"
                    className="list-row press"
                    onClick={() => navigate(`/s/${encodeURIComponent(hit.symbol)}`)}
                  >
                    <div className="sym-badge">{initials(hit.symbol)}</div>
                    <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="sym-name">{hit.symbol}</span>
                        <span className="pill green">{minutesLabel(hit.closeAt)}</span>
                      </div>
                      <span className="sym-meta">
                        OR ₹{fmtPrice(hit.orLow)}–₹{fmtPrice(hit.orHigh)} · range {pct(hit.range ? (hit.range / hit.orHigh) * 100 : 0)}
                      </span>
                    </div>
                    <div className="col right" style={{ gap: 3 }}>
                      <span className="num strong">₹{fmtPrice(hit.price)}</span>
                      <span className="up tiny">+{hit.pctOver.toFixed(2)}% over</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <Empty icon="target" title="No breakout by this time">
                No constituent has closed a 5-minute bar above its opening range high yet. Move the cutoff
                later, or look at the names still watching their range.
              </Empty>
            )}
          </div>

          <div className="section-head">
            <div className="section-title">Still watching</div>
            <span className="tiny muted">{filteredOrb.watched.length}</span>
          </div>

          <div className="glass list">
            {filteredOrb.watched.length ? (
              filteredOrb.watched.slice(0, 10).map((w) => (
                <button
                  key={w.symbol}
                  type="button"
                  className="list-row press"
                  onClick={() => navigate(`/s/${encodeURIComponent(w.symbol)}`)}
                >
                  <div className="sym-badge">{initials(w.symbol)}</div>
                  <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                    <span className="sym-name">{w.symbol}</span>
                    <span className="sym-meta">
                      ₹{fmtPrice(w.price)} vs OR high ₹{fmtPrice(w.orHigh)}
                    </span>
                  </div>
                  <div className="col right" style={{ gap: 2 }}>
                    <span className={`small strong ${w.pctOver >= 0 ? "up" : "down"}`}>
                      {w.pctOver >= 0 ? "+" : ""}
                      {w.pctOver.toFixed(2)}%
                    </span>
                    <span className="tiny muted">to trigger</span>
                  </div>
                </button>
              ))
            ) : (
              <Empty icon="eye" title="Nothing in the watch pile">
                Every usable symbol either broke out or the filter hides the rest.
              </Empty>
            )}
          </div>

          <p className="tiny muted" style={{ lineHeight: 1.55, padding: "0 4px" }}>
            Based on the {market.session.date} snapshot with the {minutesLabel(cutoff)} cutoff. A hit is a
            completed close above the range, never an intrabar touch.
          </p>
        </>
      )}
    </div>
  );
}
