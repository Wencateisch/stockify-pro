import { useEffect } from "react";
import { useRoute, navigate, symbolPath } from "./router";
import { useApp } from "./lib/store";
import {
  useAlertWatcher,
  useAutoPaperExits,
  useLiveAutoRefresh,
  useMarketClock,
  useReplayEngine,
} from "./lib/hooks";
import { DeskScreen } from "./screens/Desk";
import { ScannerScreen } from "./screens/Scanner";
import { SymbolScreen } from "./screens/Symbol";
import { TimeMachineScreen } from "./screens/TimeMachine";
import { JournalScreen } from "./screens/Journal";
import { AlertsScreen } from "./screens/Alerts";
import { SettingsScreen } from "./screens/Settings";
import { Rail, TabBar } from "./components/Nav";
import { ReplayBar } from "./components/ReplayBar";
import { Toasts } from "./components/Toasts";
import { Onboarding } from "./components/Onboarding";
import { BrandMark, Icon } from "./components/Icons";
import { Empty } from "./components/UI";
import { ErrorBoundary } from "./components/ErrorBoundary";

function toneFor(status: string): string {
  if (status === "open") return "green";
  if (status === "pre-open") return "blue";
  if (status === "flat-by") return "amber";
  if (status === "replay") return "violet";
  return "";
}

export function App() {
  const route = useRoute();
  const load = useApp((s) => s.loadMarketData);
  const replay = useApp((s) => s.replay);
  const mode = useApp((s) => s.settings.mode);
  const liveSource = useApp((s) => s.settings.liveSource);
  const serverUrl = useApp((s) => s.settings.serverUrl);
  const setSettings = useApp((s) => s.setSettings);
  const refreshLive = useApp((s) => s.refreshLive);
  const stopReplay = useApp((s) => s.stopReplay);
  const pushToast = useApp((s) => s.pushToast);
  const clock = useMarketClock();

  useEffect(() => {
    void load();
  }, [load]);

  useReplayEngine();
  useAlertWatcher();
  useAutoPaperExits();
  useLiveAutoRefresh();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route.path]);

  const detail = route.name === "symbol" || route.name === "tm";
  const title = route.name === "symbol" ? route.symbol : route.name === "tm" ? "Time Machine" : "";

  const cycleMode = () => {
    if (replay) {
      stopReplay();
      pushToast("Replay closed. Back to the snapshot.", "info");
      return;
    }
    const next = mode === "live" ? "snapshot" : "live";
    setSettings({ mode: next });
    if (next === "live") void refreshLive();
    pushToast(
      next === "live"
        ? `Live mode: ${liveSource === "direct" ? "the public NSE feed, refreshed every 15 seconds" : serverUrl}.`
        : "Snapshot mode: the bundled real NSE data.",
      "info",
    );
  };

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true" />

      <header className="topbar">
        {detail ? (
          <>
            <button
              type="button"
              className="icon-btn"
              aria-label="Back"
              onClick={() => navigate(route.name === "tm" ? symbolPath(route.symbol) : "/scan")}
            >
              <Icon name="back" size={18} />
            </button>
            <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
              <span className="topbar-title">{title}</span>
              <span className="topbar-sub">{route.name === "tm" ? "Replay study" : "Symbol desk"}</span>
            </div>
          </>
        ) : (
          <>
            <div className="brand mobile">
              <BrandMark size={32} />
              <div className="col" style={{ gap: 0 }}>
                <span className="brand-name">Stockify Pro</span>
                <span className="brand-sub">NSE Day Trader</span>
              </div>
            </div>
            <div className="grow" />
          </>
        )}

        <button
          type="button"
          className={`pill ${toneFor(replay ? "replay" : clock.status)}`}
          onClick={cycleMode}
          title={replay ? "Exit replay" : "Switch between the snapshot and the live feed"}
          style={{ cursor: "pointer" }}
        >
          {clock.status === "open" || clock.status === "replay" ? <span className="live-dot" /> : null}
          {replay ? "Replay" : mode === "live" ? "Live" : clock.label}
        </button>

        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => navigate("/settings")}>
          <Icon name="sliders" size={18} />
        </button>
      </header>

      <Rail route={route} />

      <main
        className="content"
        style={replay ? { paddingBottom: "calc(var(--tabbar-h) + 168px + var(--safe-bottom))" } : undefined}
      >
        <ErrorBoundary>
          {route.name === "desk" && <DeskScreen />}
          {route.name === "scan" && <ScannerScreen />}
          {route.name === "symbol" && <SymbolScreen key={route.symbol} symbol={route.symbol} />}
          {route.name === "tm" && <TimeMachineScreen key={route.symbol} symbol={route.symbol} />}
          {route.name === "journal" && <JournalScreen />}
          {route.name === "alerts" && <AlertsScreen />}
          {route.name === "settings" && <SettingsScreen />}
          {route.name === "notfound" && (
            <div className="page">
              <div className="glass card">
                <Empty
                  icon="search"
                  title="That page is not on the desk"
                  action={<button type="button" className="btn primary" onClick={() => navigate("/")}>Back to the desk</button>}
                >
                  The address {route.path} does not match a screen.
                </Empty>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </main>

      <ReplayBar />
      <TabBar route={route} />
      <Toasts />
      <Onboarding />
    </div>
  );
}
