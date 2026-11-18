import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { useMarketClock } from "../lib/hooks";
import { loadHistory } from "../lib/data";
import { getTMSeed, type TMSeed } from "../lib/draft";
import { orbForInstrument } from "../lib/orb";
import { floorTick, roundTick } from "../lib/plan";
import { fmtClock, splitSessions } from "../lib/timemachine";
import type { HistoryDoc, TMInput, TMOutput } from "../lib/types";
import { BAR_MIN, CLOSE_MIN, OPEN_MIN, dateLabel, istDateStr, minutesLabel } from "../lib/time";
import { pct, price as fmtPrice } from "../lib/format";
import { navigate, symbolPath } from "../router";
import { Icon } from "../components/Icons";
import { FanChart, HistogramChart } from "../components/Chart";
import { Empty, Field, KV, Loading, NumInput, Segmented, Stat } from "../components/UI";
import { chime } from "../lib/feedback";

interface TMForm {
  entry: number;
  stop: number;
  target: number;
  entryMinutes: number;
  untilMinutes: number;
  replays: number;
}

interface RunState {
  result: TMOutput | null;
  error: string | null;
  running: boolean;
  date: string;
}

const SEED = 19;

function entryBarClose(minutes: number): number {
  return Math.min(15 * 60, Math.max(9 * 60 + 20, Math.ceil(minutes / BAR_MIN) * BAR_MIN));
}

function parseFlatBy(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!m) return 15 * 60 + 15;
  return Number(m[1]) * 60 + Number(m[2]);
}

function buildForm(
  seed: TMSeed | null,
  fallbackEntry: number,
  fallbackStop: number,
  fallbackTarget: number,
  fallbackMinutes: number,
  flatBy: number,
): TMForm {
  let entry = seed?.entry && seed.entry > 0 ? roundTick(seed.entry) : roundTick(fallbackEntry);
  let stop = seed?.stop && seed.stop > 0 ? roundTick(seed.stop) : fallbackStop;
  let target = seed?.target && seed.target > 0 ? roundTick(seed.target) : fallbackTarget;
  if (!(stop < entry)) stop = floorTick(entry * 0.99);
  if (!(target > entry)) target = roundTick(entry + 2 * (entry - stop));
  let entryMinutes = seed?.entryMinutes ? entryBarClose(seed.entryMinutes) : entryBarClose(fallbackMinutes);
  let until = Math.max(flatBy, entryMinutes + BAR_MIN * 3);
  if (until > 15 * 60 + 25) until = 15 * 60 + 25;
  if (entryMinutes >= until) entryMinutes = Math.max(9 * 60 + 20, until - BAR_MIN * 3);
  return { entry, stop, target, entryMinutes, untilMinutes: until, replays: 10_000 };
}

function minutesOfDay(options: number[]): { value: number; label: string }[] {
  return options.map((m) => ({ value: m, label: minutesLabel(m) }));
}

export function TimeMachineScreen({ symbol }: { symbol: string }) {
  const market = useApp((s) => s.market);
  const rules = useApp((s) => s.rules);
  const settings = useApp((s) => s.settings);
  const pushToast = useApp((s) => s.pushToast);
  const clock = useMarketClock();

  const inst = market?.symbols.find((s) => s.symbol === symbol) || null;
  const seed = useMemo(() => getTMSeed(symbol), [symbol]);

  const [history, setHistory] = useState<HistoryDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<TMForm | null>(null);
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const pendingId = useRef(0);
  const autoRan = useRef("");

  const [state, setState] = useState<RunState>({ result: null, error: null, running: false, date: "" });

  const orb = useMemo(() => (inst ? orbForInstrument(inst, 15, CLOSE_MIN) : null), [inst]);
  const intradayDate = useMemo(() => {
    if (!inst || !inst.intraday.length) return "";
    return istDateStr(inst.intraday[0][0] * 1000);
  }, [inst]);

  useEffect(() => {
    let alive = true;
    setHistory(null);
    setLoadError(null);
    setState({ result: null, error: null, running: false, date: "" });
    autoRan.current = "";
    loadHistory(symbol)
      .then((doc) => {
        if (alive) setHistory(doc);
      })
      .catch((err) => {
        if (alive) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  useEffect(() => {
    const w = new Worker(new URL("../lib/tm.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: TMOutput; error?: string }>) => {
      const msg = event.data;
      if (!msg || msg.id !== pendingId.current) return;
      if (msg.ok && msg.result) {
        setState((s) => ({ ...s, running: false, result: msg.result!, error: null }));
        chime("alert", useApp.getState().settings.sound);
      } else {
        setState((s) => ({ ...s, running: false, error: msg.error || "The replay failed." }));
      }
    };
    w.onerror = () => {
      setState((s) => ({ ...s, running: false, error: "The replay worker could not start." }));
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runWith = (f: TMForm, doc: HistoryDoc, quiet = false) => {
    if (!worker.current) return;
    const k = Math.round((f.entryMinutes - OPEN_MIN) / BAR_MIN) - 1;
    if (k < 0) {
      setState((s) => ({ ...s, error: "The entry has to close between 09:20 and 15:25." }));
      return;
    }
    const sessions = splitSessions(doc.bars);
    const dates = [...sessions.keys()].sort();
    let date = "";
    for (let i = dates.length - 1; i >= 0; i--) {
      const day = sessions.get(dates[i])!;
      if (day.size >= 70 && day.has(k)) {
        date = dates[i];
        break;
      }
    }
    if (!date) {
      setState((s) => ({
        ...s,
        result: null,
        error: `No complete session in the history has a 5-minute bar closing at ${minutesLabel(f.entryMinutes)}.`,
      }));
      return;
    }
    if (!(f.stop < f.entry && f.entry < f.target)) {
      setState((s) => ({ ...s, result: null, error: "A buy needs stop < entry < target." }));
      return;
    }
    if (f.untilMinutes <= f.entryMinutes) {
      setState((s) => ({ ...s, result: null, error: "Flat-by must come after the entry bar." }));
      return;
    }

    const input: TMInput = {
      symbol,
      entry: roundTick(f.entry),
      stop: roundTick(f.stop),
      target: roundTick(f.target),
      entryMinutes: f.entryMinutes,
      entryTimeLabel: minutesLabel(f.entryMinutes),
      orMinutes: 15,
      orHigh: orb?.orHigh || 0,
      orLow: orb?.orLow || 0,
      stopRule: seed?.stopRule || "or-mid",
      risk: roundTick(f.entry - f.stop),
      targetR: Math.round(((f.target - f.entry) / (f.entry - f.stop)) * 100) / 100,
      date,
      untilMinutes: f.untilMinutes,
      replays: f.replays,
      seed: SEED,
      bars: doc.bars,
    };
    const id = ++requestId.current;
    pendingId.current = id;
    setState((s) => ({ ...s, running: true, error: null, date }));
    worker.current.postMessage({ id, input });
    if (!quiet) pushToast(`Replaying ${f.replays.toLocaleString("en-IN")} paths on ${dateLabel(date)}.`, "info");
  };

  useEffect(() => {
    if (!history || !inst || !form) return;
    if (autoRan.current === symbol) return;
    autoRan.current = symbol;
    runWith(form, history, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, inst, form, symbol]);

  useEffect(() => {
    if (!inst) return;
    const entry = roundTick(inst.quote.price);
    const stop =
      orb && orb.orHigh !== null && orb.orLow !== null
        ? floorTick((orb.orHigh + orb.orLow) / 2)
        : floorTick(entry * 0.99);
    const target = roundTick(entry + 2 * (entry - stop));
    const f = buildForm(seed, entry, stop, target, clock.minutes || 14 * 60, parseFlatBy(rules.flatBy));
    setForm(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, seed, inst]);

  const run = () => {
    if (!form || !history) return;
    runWith(form, history);
  };

  const setField = (patch: Partial<TMForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const risk = form ? roundTick(form.entry - form.stop) : 0;
  const rMultiple = risk > 0 ? (form!.target - form!.entry) / risk : 0;

  if (!market) {
    return (
      <div className="page">
        <div className="glass card"><Loading label="Loading the snapshot…" /></div>
      </div>
    );
  }

  if (!inst) {
    return (
      <div className="page">
        <div className="glass card">
          <Empty icon="search" title={`No ${symbol} in the snapshot`}>
            <button type="button" className="btn ghost" onClick={() => navigate(symbolPath(symbol))}>Try the symbol page</button>
          </Empty>
        </div>
      </div>
    );
  }

  const res = state.result;
  const untilLabel = form ? fmtClock(form.untilMinutes) : rules.flatBy;

  return (
    <div className="page">
      <div className="row" style={{ gap: 12, padding: "2px 2px 0" }}>
        <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
          <span className="small strong">{inst.symbol}</span>
          <span className="tiny muted truncate">{inst.name}</span>
        </div>
        <span className="pill violet">10,000 replays</span>
      </div>

      <div className="glass card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <div className="col" style={{ gap: 2 }}>
            <span className="small strong">The plan to test</span>
            <span className="tiny muted">
              {state.date ? `Replay day ${dateLabel(state.date, true)}` : "Uses the latest complete session with that bar"}
            </span>
          </div>
          <span className="pill blue">{seed ? "from the plan" : "seeded from the snapshot"}</span>
        </div>

        {form ? (
          <>
            <div className="form-grid">
              <Field label="Entry">
                <NumInput value={form.entry} onChange={(n) => setField({ entry: n })} prefix="₹" min={0.05} />
              </Field>
              <Field label="Stop">
                <NumInput value={form.stop} onChange={(n) => setField({ stop: n })} prefix="₹" min={0.05} />
              </Field>
              <Field label="Target">
                <NumInput value={form.target} onChange={(n) => setField({ target: n })} prefix="₹" min={0.05} />
              </Field>
              <Field label="Risk : reward" hint={risk > 0 ? `₹${fmtPrice(risk)} risk a share` : "stop must be under entry"}>
                <input className="input" readOnly value={`${Number.isFinite(rMultiple) ? rMultiple.toFixed(2) : "—"} : 1`} />
              </Field>
            </div>

            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Entry bar closes" hint="the 5-minute bar that triggers the plan">
                <select
                  className="select"
                  value={form.entryMinutes}
                  onChange={(e) => setField({ entryMinutes: Number(e.target.value) })}
                >
                  {minutesOfDay(
                    Array.from({ length: 73 }, (_, i) => 9 * 60 + 20 + i * 5),
                  ).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Flat by" hint={`no holds past this in the replay`}>
                <select
                  className="select"
                  value={form.untilMinutes}
                  onChange={(e) => setField({ untilMinutes: Number(e.target.value) })}
                >
                  {minutesOfDay([15 * 60, 15 * 60 + 5, 15 * 60 + 10, 15 * 60 + 15, 15 * 60 + 20, 15 * 60 + 25]).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <div className="grow">
                <Segmented
                  ariaLabel="Replay count"
                  value={form.replays}
                  onChange={(v) => setField({ replays: v })}
                  options={[
                    { value: 1000, label: "1,000" },
                    { value: 5000, label: "5,000" },
                    { value: 10000, label: "10,000" },
                  ]}
                />
              </div>
              <button type="button" className="btn primary" onClick={run} disabled={state.running || !history}>
                {state.running ? <><span className="spinner dark" /> Replaying</> : <><Icon name="play" size={15} /> Replay</>}
              </button>
            </div>
            {!history && !loadError && <div className="tiny muted" style={{ marginTop: 8 }}>Loading 59 sessions of 5-minute bars…</div>}
          </>
        ) : (
          <Loading label="Seeding the plan…" />
        )}
      </div>

      {loadError && (
        <div className="warn-box red">
          <Icon name="alert" size={16} />
          <span>{loadError}</span>
        </div>
      )}

      {state.error && !state.running && (
        <div className="warn-box red">
          <Icon name="alert" size={16} />
          <span>{state.error}</span>
        </div>
      )}

      {!res && state.running && (
        <div className="glass card">
          <Loading label={`Cranking ${(form?.replays || 10000).toLocaleString("en-IN")} replays through the session pool…`} />
        </div>
      )}

      {res && (
        <>
          <div className="glass card pad-lg">
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="hero-label">The verdict</span>
              <span className="pill violet">seed {res.seed} · {res.poolSessions} sessions</span>
            </div>
            <p style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.35 }}>
              {res.verdict}
            </p>
            <div className="tiny muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              {res.replays.toLocaleString("en-IN")} paths · entry {minutesLabel(form!.entryMinutes)} · flat by{" "}
              {untilLabel} · {res.barsLeft} five-minute bars replayed
            </div>

            <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", marginTop: 16, background: "rgba(255,255,255,0.06)" }}>
              <i style={{ width: `${res.pTarget * 100}%`, background: "var(--green)" }} />
              <i style={{ width: `${res.pNeither * 100}%`, background: "rgba(255,255,255,0.2)" }} />
              <i style={{ width: `${res.pStop * 100}%`, background: "var(--red)" }} />
            </div>
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="tiny up">target first {pct(res.pTarget * 100, 1)}</span>
              <span className="tiny muted">neither {pct(res.pNeither * 100, 1)}</span>
              <span className="tiny down">stop first {pct(res.pStop * 100, 1)}</span>
            </div>

            <div className="divider" />

            <div className="metrics" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div>
                <div className="metric-k">Green by {untilLabel}</div>
                <div className="metric-v up">{pct(res.pGreen * 100, 1)}</div>
              </div>
              <div>
                <div className="metric-k">Average R</div>
                <div className="metric-v" style={{ color: res.avgR >= 0 ? "var(--green)" : "var(--red)" }}>
                  {res.avgR > 0 ? "+" : ""}{res.avgR.toFixed(3)}
                </div>
              </div>
              <div>
                <div className="metric-k">Median close</div>
                <div className="metric-v">₹{fmtPrice(res.medianClose)}</div>
              </div>
              <div>
                <div className="metric-k">5–95% close</div>
                <div className="metric-v" style={{ fontSize: 13 }}>₹{fmtPrice(res.p5Close)} – ₹{fmtPrice(res.p95Close)}</div>
              </div>
            </div>

            {res.notes.map((n, i) => (
              <div key={i} className="warn-box" style={{ marginTop: 10 }}>
                <Icon name="info" size={15} /><span>{n}</span>
              </div>
            ))}
            {res.warnings.map((w, i) => (
              <div key={`w${i}`} className="warn-box red" style={{ marginTop: 10 }}>
                <Icon name="alert" size={15} /><span>{w}</span>
              </div>
            ))}
          </div>

          <div className="glass card">
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="section-title">Paths of 1,000 replays</span>
              <div className="legend">
                <span><i style={{ background: "#c7d5ff" }} />median</span>
                <span><i style={{ background: "rgba(143,179,255,0.5)" }} />50%</span>
                <span><i style={{ background: "rgba(74,222,155,0.4)" }} />5–95%</span>
              </div>
            </div>
            <FanChart
              bands={res.bands}
              paths={res.samplePaths}
              times={res.bandTimes}
              entry={form!.entry}
              stop={form!.stop}
              target={form!.target}
              height={236}
            />
            <p className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
              Each path samples a real 5-minute return near the same time of day, ±2 slots. The stop is
              checked before the target inside every bar — the conservative assumption.
            </p>
          </div>

          <div className="glass card">
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="section-title">Where the {res.replays.toLocaleString("en-IN")} replays closed</span>
              <span className="tiny muted">entry ₹{fmtPrice(form!.entry)}</span>
            </div>
            <HistogramChart hist={res.hist} entry={form!.entry} />
            <div className="row between" style={{ marginTop: 8 }}>
              <span className="tiny muted">P1 ₹{fmtPrice(res.hist.lo)}</span>
              <span className="tiny muted">P99 ₹{fmtPrice(res.hist.hi)}</span>
            </div>
          </div>

          <div className="section-head">
            <div className="section-title"><span className="dot" /> History, same rule</div>
            <span className="pill">{res.history.sessions} sessions</span>
          </div>

          <div className="glass card">
            <div className="row" style={{ gap: 8 }}>
              <div className="grow">
                <Stat k="Triggered" v={res.history.triggered} sub={`of ${res.history.sessions} sessions`} />
              </div>
              <div className="grow">
                <Stat k="Win rate" v={res.history.triggered ? pct((res.history.green / res.history.triggered) * 100, 0) : "—"} tone="up" />
              </div>
              <div className="grow">
                <Stat
                  k="Avg R"
                  v={res.history.avgR === null ? "—" : `${res.history.avgR > 0 ? "+" : ""}${res.history.avgR.toFixed(2)}`}
                  tone={res.history.avgR !== null && res.history.avgR >= 0 ? "up" : "down"}
                />
              </div>
            </div>
            <div className="row between" style={{ marginTop: 10 }}>
              <span className="tiny muted">target {res.history.target}</span>
              <span className="tiny muted">stop {res.history.stop}</span>
              <span className="tiny muted">flat at {untilLabel} {res.history.close}</span>
            </div>

            {res.history.trades.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="tbl">
                  <thead>
                    <tr><th>Date</th><th>Entry</th><th>Out</th><th>R</th></tr>
                  </thead>
                  <tbody>
                    {res.history.trades.slice(-8).reverse().map((t, i) => (
                      <tr key={i}>
                        <td className="nowrap">{t.date.slice(5)} · {t.time}</td>
                        <td>₹{fmtPrice(t.entry)}</td>
                        <td className={t.outcome === "target" ? "up" : t.outcome === "stop" ? "down" : "muted"}>
                          {t.outcome}
                        </td>
                        <td className={t.r >= 0 ? "up" : "down"}>{t.r > 0 ? "+" : ""}{t.r.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
              The same opening-range entry rule walked through {res.history.sessions} real sessions from{" "}
              {res.poolFrom} to {res.poolTo}, stopped at the plan's stop and taken off at the flat-by time.
            </p>
          </div>

          <div className="glass card tight">
            <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <Icon name="info" size={16} style={{ color: "var(--blue)", marginTop: 1 }} />
              <div className="col" style={{ gap: 5 }}>
                <span className="small strong">How to read this</span>
                <span className="tiny muted" style={{ lineHeight: 1.55 }}>
                  The Time Machine is a conditional study, not a forecast. It asks: if the next few hours
                  behaved like the sessions in the pool, how often would the target or the stop come first?
                  It cannot know news, liquidity or a gap. {res.shortSessions > 0 ? `${res.shortSessions} short sessions were skipped.` : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost grow" onClick={() => navigate(symbolPath(symbol))}>
              <Icon name="back" size={15} /> Back to the plan
            </button>
            <button type="button" className="btn primary grow" onClick={run} disabled={state.running}>
              <Icon name="refresh" size={15} /> Run again
            </button>
          </div>
        </>
      )}

      {!res && !state.running && form && !state.error && !loadError && (
        <div className="glass card">
          <Empty icon="clock" title="Ready when you are">
            Replays the plan across the bundled 5-minute sessions, using the same entry bar, stop and target.
            Seed {SEED}, {form.replays.toLocaleString("en-IN")} paths.
          </Empty>
        </div>
      )}

      <p className="tiny muted center" style={{ lineHeight: 1.6 }}>
        Real NSE 5-minute bars · {res ? `${res.poolSessions} pooled sessions` : "59 bundled sessions"}.
        <br />
        A probability study, not advice. Paper only.
      </p>
    </div>
  );
}
