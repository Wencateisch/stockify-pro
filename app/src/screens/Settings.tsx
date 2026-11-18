import { useState } from "react";
import { useApp, DEFAULT_RULES, DEFAULT_SETTINGS } from "../lib/store";
import { fmtDate } from "../lib/market";
import { dateLabel, istDateStr, parseHHMM } from "../lib/time";
import { inr } from "../lib/format";
import { Icon } from "../components/Icons";
import { IstStamp } from "../components/IstClock";
import { Empty, Field, KV, NumInput, Segmented, SwitchRow } from "../components/UI";
import { Sheet } from "../components/Sheet";

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 9 * 60 + 15; m <= 15 * 60 + 30; m += 5) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

export function SettingsScreen() {
  const market = useApp((s) => s.market);
  const rules = useApp((s) => s.rules);
  const setRules = useApp((s) => s.setRules);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const liveQuotes = useApp((s) => s.liveQuotes);
  const liveError = useApp((s) => s.liveError);
  const liveLoading = useApp((s) => s.liveLoading);
  const refreshLive = useApp((s) => s.refreshLive);
  const pushToast = useApp((s) => s.pushToast);
  const setIntroSeen = useApp((s) => s.setIntroSeen);
  const [blockedInput, setBlockedInput] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  const windowBad = [rules.noEntriesBefore, rules.noEntriesAfter, rules.flatBy].map(parseHHMM);
  const windowOrderBad = !(windowBad[0] < windowBad[1] && windowBad[1] <= windowBad[2]);

  const testLive = async () => {
    await refreshLive();
    const state = useApp.getState();
    const label = state.settings.liveSource === "direct" ? "the direct NSE feed" : "your server";
    if (state.liveError) {
      pushToast(`${label} failed: ${state.liveError}`, "red");
    } else {
      pushToast(`${label} answered with ${Object.keys(state.liveQuotes).length} quotes.`, "green");
    }
  };

  const addBlocked = () => {
    const clean = blockedInput.trim().toUpperCase();
    if (!clean) return;
    if (!rules.blocked.includes(clean)) setRules({ blocked: [...rules.blocked, clean] });
    setBlockedInput("");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">The rules the desk actually enforces</div>
        </div>
        <span className="pill green">paper</span>
      </div>

      <div className="section-head"><div className="section-title"><span className="dot" /> Capital &amp; limits</div></div>
      <div className="glass card">
        <div className="form-grid">
          <Field label="Trading capital" hint="the paper account size">
            <NumInput value={rules.capital} onChange={(n) => setRules({ capital: n })} prefix="₹" min={1000} step={1000} />
          </Field>
          <Field label="Max loss a trade">
            <NumInput value={rules.maxLossPerTrade} onChange={(n) => setRules({ maxLossPerTrade: n })} prefix="₹" min={1} step={100} />
          </Field>
          <Field label="Max position">
            <NumInput value={rules.maxPositionPct} onChange={(n) => setRules({ maxPositionPct: n })} suffix="%" min={1} />
          </Field>
          <Field label="Max single order">
            <NumInput value={rules.maxOrder} onChange={(n) => setRules({ maxOrder: n })} prefix="₹" min={100} step={1000} />
          </Field>
          <Field label="Cash buffer" hint="never spend this share of the account">
            <NumInput value={rules.cashBufferPct} onChange={(n) => setRules({ cashBufferPct: n })} suffix="%" min={0} />
          </Field>
          <Field label="Minimum order">
            <NumInput value={rules.minOrder} onChange={(n) => setRules({ minOrder: n })} prefix="₹" min={0} step={100} />
          </Field>
        </div>
        <div className="divider" />
        <div className="row between">
          <span className="tiny muted">Starting capital</span>
          <span className="small strong">{inr(rules.capital, 0)}</span>
        </div>
      </div>

      <div className="section-head"><div className="section-title"><span className="dot" /> Daily discipline</div></div>
      <div className="glass card">
        <div className="form-grid">
          <Field label="Max trades a day">
            <NumInput value={rules.maxTradesPerDay} onChange={(n) => setRules({ maxTradesPerDay: n })} min={1} step={1} inputMode="numeric" />
          </Field>
          <Field label="Max orders a day">
            <NumInput value={rules.maxOrdersPerDay} onChange={(n) => setRules({ maxOrdersPerDay: n })} min={1} step={1} inputMode="numeric" />
          </Field>
          <Field label="Max daily loss">
            <NumInput value={rules.maxDailyLoss} onChange={(n) => setRules({ maxDailyLoss: n })} prefix="₹" min={1} step={500} />
          </Field>
          <Field label="Minimum reward : risk">
            <NumInput value={rules.minRewardRisk} onChange={(n) => setRules({ minRewardRisk: n })} suffix=":1" min={0.1} step={0.1} />
          </Field>
        </div>

        <div className="divider" />

        <div className="form-grid three">
          <Field label="No entries before">
            <select className="select" value={rules.noEntriesBefore} onChange={(e) => setRules({ noEntriesBefore: e.target.value })}>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="No entries after">
            <select className="select" value={rules.noEntriesAfter} onChange={(e) => setRules({ noEntriesAfter: e.target.value })}>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Flat by">
            <select className="select" value={rules.flatBy} onChange={(e) => setRules({ flatBy: e.target.value })}>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        {windowOrderBad && (
          <div className="warn-box red" style={{ marginTop: 10 }}>
            <Icon name="alert" size={16} />
            <span>The window is inconsistent: entries must open before they close, and the flat-by should not come before the last entry.</span>
          </div>
        )}

        <div className="divider" />
        <SwitchRow
          title="Every entry needs a stop"
          sub="The gate blocks any buy without one."
          on={rules.requireStop}
          onToggle={() => setRules({ requireStop: !rules.requireStop })}
        />
      </div>

      <div className="section-head"><div className="section-title"><span className="dot" /> Blocked symbols</div></div>
      <div className="glass card">
        {rules.blocked.length ? (
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            {rules.blocked.map((b) => (
              <button
                key={b}
                type="button"
                className="chip on"
                onClick={() => setRules({ blocked: rules.blocked.filter((x) => x !== b) })}
                title="Remove from the blocked list"
              >
                {b} <Icon name="close" size={11} />
              </button>
            ))}
          </div>
        ) : (
          <p className="tiny muted" style={{ marginBottom: 10 }}>
            Nothing blocked. Add a symbol to keep the risk gate from ever passing it.
          </p>
        )}
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input grow"
            value={blockedInput}
            onChange={(e) => setBlockedInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") addBlocked(); }}
            placeholder="e.g. ADANIENT"
            spellCheck={false}
          />
          <button type="button" className="btn ghost" onClick={addBlocked} disabled={!blockedInput.trim()}>
            <Icon name="plus" size={15} /> Add
          </button>
        </div>
      </div>

      <div className="section-head"><div className="section-title"><span className="dot" /> Data &amp; mode</div></div>
      <div className="glass card">
        <Segmented
          ariaLabel="Data mode"
          value={settings.mode}
          onChange={(mode) => {
            setSettings({ mode });
            if (mode === "live") void refreshLive();
          }}
          options={[
            { value: "snapshot", label: "Bundled snapshot" },
            { value: "live", label: "Live feed" },
          ]}
        />
        <p className="tiny muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
          The snapshot is real Yahoo Finance NSE data bundled at build time. Live mode polls the same 50
          NSE names from Moneycontrol&apos;s public feed every 30 seconds — no server, no key — or from a
          proxy you run yourself.
        </p>

        {settings.mode === "live" && (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Live source</label>
              <Segmented
                ariaLabel="Live source"
                value={settings.liveSource}
                onChange={(liveSource) => {
                  setSettings({ liveSource });
                  void refreshLive();
                }}
                options={[
                  { value: "direct", label: "Direct NSE feed" },
                  { value: "server", label: "My server" },
                ]}
              />
              <span className="tiny muted" style={{ display: "block", marginTop: 6, lineHeight: 1.5 }}>
                {settings.liveSource === "direct"
                  ? "Fetched straight from the browser. All 50 scrip ids are pinned and NSE-verified, so a bad key can never show another company's price."
                  : "Your own backend, proxying Yahoo Finance. Must serve GET /api/quotes with CORS."}
              </span>
            </div>

            {settings.liveSource === "server" && (
              <Field
                label="Server URL"
                hint="A page on HTTPS can only reach an HTTPS server, so use https:// for a hosted proxy and http:// only from the native app or localhost."
              >
                <input
                  className="input"
                  value={settings.serverUrl}
                  onChange={(e) => setSettings({ serverUrl: e.target.value })}
                  placeholder="http://localhost:3001"
                  spellCheck={false}
                />
              </Field>
            )}

            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn ghost grow" onClick={() => void testLive()} disabled={liveLoading}>
                {liveLoading ? <><span className="spinner" /> Testing</> : <><Icon name="wifi" size={15} /> Test connection</>}
              </button>
              <span className={`pill ${liveError ? "red" : Object.keys(liveQuotes).length ? "green" : ""}`}>
                {liveError ? "error" : `${Object.keys(liveQuotes).length} quotes`}
              </span>
            </div>
            {liveError && <div className="tiny down" style={{ marginTop: 8 }}>{liveError}</div>}
            {!liveError && Object.keys(liveQuotes).length > 0 && (
              <div className="tiny muted" style={{ marginTop: 8 }}>
                <IstStamp
                  ts={Math.max(0, ...Object.values(liveQuotes).map((q) => q.asOf || 0))}
                  label="Last tick"
                />
              </div>
            )}
          </>
        )}

        <div className="divider" />
        <SwitchRow title="Sound" sub="A soft two-note chime on fills and alerts." on={settings.sound} onToggle={() => setSettings({ sound: !settings.sound })} />
        <SwitchRow title="Haptics" sub="A short vibration on supported devices." on={settings.haptics} onToggle={() => setSettings({ haptics: !settings.haptics })} />
        <div className="divider" />
        <div className="field">
          <label>Replay speed</label>
          <Segmented
            ariaLabel="Replay speed"
            value={settings.replaySpeed}
            onChange={(v) => setSettings({ replaySpeed: v })}
            options={[
              { value: 300, label: "0.3s / bar" },
              { value: 700, label: "0.7s / bar" },
              { value: 1200, label: "1.2s / bar" },
              { value: 2000, label: "2s / bar" },
            ]}
          />
        </div>
      </div>

      <div className="section-head"><div className="section-title"><span className="dot" /> The snapshot</div></div>
      <div className="glass card">
        {market ? (
          <>
            <KV k="Source" v={market.source} />
            <KV k="Generated" v={fmtDate(market.generatedAt)} />
            <KV k="Trading date" v={dateLabel(market.session.date, true)} />
            <KV k="Symbols" v={`${market.symbols.length} Nifty 50 names`} />
            <KV
              k="Daily bars"
              v={(() => {
                const counts = market.symbols.map((s) => s.daily.length);
                const lo = Math.min(...counts);
                const hi = Math.max(...counts);
                return lo === hi ? `${lo} per symbol` : `${lo}–${hi} per symbol`;
              })()}
            />
            <KV k="5-min history" v="59 sessions bundled per symbol" />
            <KV
              k="Intraday session"
              v={
                market.symbols[0]?.intraday.length
                  ? `${istDateStr(market.symbols[0].intraday[0][0] * 1000)} (last complete)`
                  : "none in the snapshot"
              }
            />
            <div className="warn-box" style={{ marginTop: 10 }}>
              <Icon name="info" size={16} />
              <span>
                Point-in-time data, not a live feed. The NIFTY 50 index itself is not redistributed: the desk
                shows an equal-weight proxy built from the 50 constituents.
              </span>
            </div>
          </>
        ) : (
          <Empty title="No snapshot loaded" icon="layers" />
        )}
      </div>

      <div className="section-head"><div className="section-title"><span className="dot" /> Holidays &amp; sessions</div></div>
      <div className="glass card">
        <p className="small" style={{ color: "var(--ink-2)", lineHeight: 1.55 }}>
          Sessions run 09:15–15:30 IST. No entries before {rules.noEntriesBefore} or after{" "}
          {rules.noEntriesAfter}; every position is flat by {rules.flatBy}. The clock also knows weekends
          and the NSE holiday list.
        </p>
        <div className="warn-box" style={{ marginTop: 10 }}>
          <Icon name="alert" size={16} />
          <span>
            2025 holidays are the published NSE list. 2026–27 here only carry the fixed national closures,
            so always confirm on nseindia.com before trusting a session.
          </span>
        </div>
        <div className="row wrap" style={{ gap: 5, marginTop: 10 }}>
          {["2026-01-26", "2026-04-03", "2026-05-01", "2026-08-15", "2026-10-02", "2026-12-25"].map((d) => (
            <span key={d} className="badge">{dateLabel(d)}</span>
          ))}
        </div>
      </div>

      <div className="section-head"><div className="section-title"><span className="dot" /> About</div></div>
      <div className="glass card">
        <div className="row between">
          <div className="col" style={{ gap: 2 }}>
            <span className="small strong">Stockify Pro</span>
            <span className="tiny muted">NSE day-trading desk · v1.0.0</span>
          </div>
          <a className="btn xs ghost" href="https://github.com/Wencateisch/stockify-pro" target="_blank" rel="noreferrer">
            <Icon name="external" size={13} /> GitHub
          </a>
        </div>
        <div className="divider" />
        <p className="tiny muted" style={{ lineHeight: 1.6 }}>
          Scan, entry timing, exit planning, replay, sizing and the pre-trade risk gate, adapted from the
          MIT-licensed Day Trader skill to Indian market hours, ₹0.05 ticks and rupee limits.
          <br />
          <br />
          Education and tooling, not financial advice. No order reaches a broker. Past replay outcomes do
          not predict the next session.
        </p>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button type="button" className="btn ghost grow" onClick={() => { setIntroSeen(false); pushToast("The intro will show on the next load.", "info"); }}>
            <Icon name="sparkles" size={14} /> Show intro again
          </button>
          <button type="button" className="btn ghost grow" onClick={() => setResetOpen(true)}>
            <Icon name="refresh" size={14} /> Reset rules
          </button>
        </div>
      </div>

      <p className="tiny muted center">Built for Android, iOS and the web from one bundle. Paper only.</p>

      <Sheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the rules?"
        sub="Capital, limits, the entry window and the blocked list return to the defaults."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => setResetOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setRules(DEFAULT_RULES);
                setSettings({ ...DEFAULT_SETTINGS, mode: settings.mode, serverUrl: settings.serverUrl });
                setResetOpen(false);
                pushToast("Rules reset to the defaults.", "amber");
              }}
            >
              Reset rules
            </button>
          </>
        }
      >
        <div className="warn-box">
          <Icon name="alert" size={16} />
          <span>Your paper book is not touched. Only the rule set changes.</span>
        </div>
      </Sheet>
    </div>
  );
}
