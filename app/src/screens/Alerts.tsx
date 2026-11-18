import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { useMarketClock, usePricePoint } from "../lib/hooks";
import { priceOf } from "../lib/prices";
import { navigate, symbolPath } from "../router";
import { dateLabel, istDateStr } from "../lib/time";
import { pct, price as fmtPrice, timeAgo } from "../lib/format";
import { Icon } from "../components/Icons";
import { Empty, Field, KV, NumInput, Segmented } from "../components/UI";
import { chime, buzz } from "../lib/feedback";
import { initials } from "../lib/market";

export function AlertsScreen() {
  const market = useApp((s) => s.market);
  const settings = useApp((s) => s.settings);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const alerts = useApp((s) => s.alerts);
  const addAlert = useApp((s) => s.addAlert);
  const removeAlert = useApp((s) => s.removeAlert);
  const pushToast = useApp((s) => s.pushToast);
  const clock = useMarketClock();

  const [symbol, setSymbol] = useState("");
  const [priceText, setPriceText] = useState(0);
  const [dir, setDir] = useState<"above" | "below">("above");
  const [permission, setPermission] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  const inst = useMemo(
    () => market?.symbols.find((s) => s.symbol === symbol) || null,
    [market, symbol],
  );
  const p = usePricePoint(inst);
  const current = inst && p ? priceOf(inst, market, settings.mode, replay, liveQuotes).price : 0;

  useEffect(() => {
    if (symbol || !market) return;
    const first = market.symbols.find((s) => s.symbol === "RELIANCE") || market.symbols[0];
    if (first) {
      setSymbol(first.symbol);
      setPriceText(Number(first.quote.price.toFixed(2)));
    }
  }, [market, symbol]);

  useEffect(() => {
    if (!p) return;
    setPriceText(Number(p.price.toFixed(2)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const active = alerts.filter((a) => !a.triggeredAt);
  const fired = alerts.filter((a) => a.triggeredAt);

  const create = () => {
    if (!inst || !(priceText > 0)) return;
    addAlert({ symbol: inst.symbol, name: inst.name, price: priceText, dir });
    chime("alert", settings.sound);
    buzz(10, settings.haptics);
    pushToast(`Alert set: ${inst.symbol} ${dir} ₹${fmtPrice(priceText)}.`, "info");
  };

  const askPermission = async () => {
    if (typeof Notification === "undefined") {
      pushToast("This browser has no notification support. In-app toasts and the chime still work.", "amber");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      pushToast(result === "granted" ? "System notifications allowed." : "System notifications were not allowed.", result === "granted" ? "green" : "amber");
    } catch {
      pushToast("The browser refused the notification prompt.", "amber");
    }
  };

  const testAlert = () => {
    chime("alert", settings.sound);
    buzz([12, 40, 12], settings.haptics);
    pushToast("Test alert · this is the toast, chime and haptic you will get.", "amber");
  };

  const currentFor = (sym: string) => {
    const i = market?.symbols.find((s) => s.symbol === sym);
    if (!i) return 0;
    return priceOf(i, market, settings.mode, replay, liveQuotes).price;
  };

  if (!market) {
    return (
      <div className="page">
        <div className="page-head"><h1 className="page-title">Alerts</h1></div>
        <div className="glass card"><Empty title="No market data" icon="bell">Reload the desk to fetch the snapshot.</Empty></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Alerts</h1>
          <div className="page-sub">Price watchers on the snapshot, live feed or replay clock</div>
        </div>
        <span className="pill">{active.length} armed</span>
      </div>

      <div className="glass card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="section-title">New price alert</span>
          <button type="button" className="link" onClick={testAlert}>Test alert</button>
        </div>

        <Field label="Symbol">
          <select
            className="select"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              const i = market.symbols.find((s) => s.symbol === e.target.value);
              if (i) setPriceText(Number(i.quote.price.toFixed(2)));
            }}
          >
            {market.symbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>{s.symbol} · {s.name}</option>
            ))}
          </select>
        </Field>

        <div className="form-grid" style={{ marginTop: 10 }}>
          <Field label="Price" hint={p ? `now ₹${fmtPrice(p.price)} · ${pct(p.changePct)}` : undefined}>
            <NumInput value={priceText} onChange={setPriceText} prefix="₹" min={0.05} />
          </Field>
          <Field label="Direction">
            <Segmented
              ariaLabel="Alert direction"
              value={dir}
              onChange={setDir}
              options={[
                { value: "above", label: "Above" },
                { value: "below", label: "Below" },
              ]}
            />
          </Field>
        </div>

        <button type="button" className="btn primary block" style={{ marginTop: 12 }} onClick={create} disabled={!(priceText > 0)}>
          <Icon name="bell" size={16} /> Arm alert
        </button>

        <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
          {current > 0 && priceText > 0
            ? `${dir === "above" ? "Above" : "Below"} ₹${fmtPrice(priceText)} is ${pct(((priceText - current) / current) * 100)} from the current ₹${fmtPrice(current)}.`
            : "Pick a price to arm the alert."}
        </p>
      </div>

      <div className="glass card tight">
        <div className="row" style={{ gap: 10 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              display: "grid",
              placeItems: "center",
              background: "rgba(143,179,255,0.12)",
              color: "var(--blue)",
              flex: "none",
            }}
          >
            <Icon name="wifi" size={17} />
          </span>
          <div className="col grow" style={{ gap: 2 }}>
            <span className="small strong">
              System notifications {permission === "granted" ? "on" : permission === "unsupported" ? "unavailable" : "off"}
            </span>
            <span className="tiny muted">
              {permission === "granted"
                ? "A banner joins the in-app toast while the app is open."
                : "The in-app toast and chime always work. A system banner needs permission."}
            </span>
          </div>
          {permission !== "granted" && permission !== "unsupported" && (
            <button type="button" className="btn xs ghost" onClick={() => void askPermission()}>Allow</button>
          )}
        </div>
      </div>

      <div className="section-head">
        <div className="section-title"><span className="dot" /> Armed</div>
        <span className="tiny muted">{clock.status === "replay" ? "replay clock" : "real clock"}</span>
      </div>

      <div className="glass list">
        {active.length ? (
          active.map((a) => {
            const now = currentFor(a.symbol);
            const dist = now > 0 ? ((a.price - now) / now) * 100 : 0;
            return (
              <div key={a.id} className="list-row" style={{ gap: 10 }}>
                <button type="button" className="sym-badge" onClick={() => navigate(symbolPath(a.symbol))} aria-label={a.symbol}>
                  {initials(a.symbol)}
                </button>
                <button type="button" className="col grow" style={{ gap: 2, textAlign: "left" }} onClick={() => navigate(symbolPath(a.symbol))}>
                  <span className="sym-name">{a.symbol}</span>
                  <span className="sym-meta">
                    {a.dir === "above" ? "Above" : "Below"} ₹{fmtPrice(a.price)} · {dateLabel(istDateStr(a.createdAt))}
                  </span>
                </button>
                <div className="col right" style={{ gap: 2 }}>
                  <span className="num small strong">₹{fmtPrice(now)}</span>
                  <span className={`tiny ${a.dir === "above" ? "up" : "down"}`}>{dist > 0 ? "+" : ""}{dist.toFixed(2)}% away</span>
                </div>
                <button type="button" className="icon-btn small" onClick={() => { removeAlert(a.id); pushToast(`Alert on ${a.symbol} removed.`, "info"); }} aria-label="Remove alert">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            );
          })
        ) : (
          <Empty icon="bell" title="No armed alerts">
            Arm a level above the range high or below the stop and the desk will chime the moment the
            snapshot, live feed or replay price crosses it.
          </Empty>
        )}
      </div>

      {fired.length > 0 && (
        <>
          <div className="section-head">
            <div className="section-title">Fired</div>
            <button type="button" className="link" onClick={() => fired.forEach((a) => removeAlert(a.id))}>Clear</button>
          </div>
          <div className="glass list">
            {fired.map((a) => (
              <div key={a.id} className="list-row" style={{ opacity: 0.72 }}>
                <span className="sym-badge">{initials(a.symbol)}</span>
                <div className="col grow" style={{ gap: 2 }}>
                  <span className="sym-name">{a.symbol}</span>
                  <span className="sym-meta">
                    {a.dir === "above" ? "Crossed above" : "Fell below"} ₹{fmtPrice(a.price)} at ₹{fmtPrice(a.triggeredPrice || 0)}
                  </span>
                </div>
                <span className="tiny muted nowrap">{a.triggeredAt ? timeAgo(a.triggeredAt) : ""}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="glass card tight">
        <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <Icon name="info" size={16} style={{ color: "var(--blue)", marginTop: 1 }} />
          <span className="tiny muted" style={{ lineHeight: 1.55 }}>
            Alerts are evaluated while the app is open, against the current price of the selected mode.
            A background push needs the optional live backend and a service worker; the bundled snapshot
            does not pretend to run one.
          </span>
        </div>
      </div>

      <KV k="Market clock" v={clock.detail} />
    </div>
  );
}
