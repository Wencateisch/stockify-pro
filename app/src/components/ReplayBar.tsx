import { useApp } from "../lib/store";
import { CLOSE_MIN, OPEN_MIN, dateLabel, minutesLabel } from "../lib/time";
import { Icon } from "./Icons";

export function ReplayBar() {
  const replay = useApp((s) => s.replay);
  const speed = useApp((s) => s.settings.replaySpeed);
  const setMinutes = useApp((s) => s.setReplayMinutes);
  const setPlaying = useApp((s) => s.setReplayPlaying);
  const stop = useApp((s) => s.stopReplay);
  const pushToast = useApp((s) => s.pushToast);
  if (!replay) return null;

  const step = (delta: number) => {
    const next = Math.min(CLOSE_MIN, Math.max(OPEN_MIN, replay.minutes + delta));
    setMinutes(next);
  };

  return (
    <div
      className="glass"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(var(--tabbar-h) + 22px + var(--safe-bottom))",
        width: "min(560px, calc(100vw - 24px))",
        zIndex: 55,
        padding: "10px 12px",
        borderRadius: 18,
      }}
      role="region"
      aria-label="Session replay controls"
    >
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="pill green">
            <span className="live-dot" />
            Replay
          </span>
          <span className="mono small strong">{minutesLabel(replay.minutes)}</span>
          <span className="tiny muted nowrap">{dateLabel(replay.date)}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="icon-btn small" onClick={() => setPlaying(!replay.playing)} aria-label={replay.playing ? "Pause" : "Play"}>
            <Icon name={replay.playing ? "pause" : "play"} size={15} />
          </button>
          <button type="button" className="icon-btn small" onClick={stop} aria-label="Exit replay">
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="icon-btn small" onClick={() => step(-5)} aria-label="Step back 5 minutes">
          <Icon name="stepBack" size={14} />
        </button>
        <input
          type="range"
          min={OPEN_MIN}
          max={CLOSE_MIN}
          step={5}
          value={replay.minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--green)", height: 22 }}
          aria-label="Replay time"
        />
        <button type="button" className="icon-btn small" onClick={() => step(5)} aria-label="Step forward 5 minutes">
          <Icon name="stepForward" size={14} />
        </button>
        <button
          type="button"
          className="chip"
          style={{ height: 26, fontSize: 10.5, padding: "0 8px" }}
          onClick={() => {
            const speeds = [300, 700, 1200, 2000];
            const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
            useApp.getState().setSettings({ replaySpeed: next });
            pushToast(`Replay speed: ${next} ms per 5-minute bar`, "info");
          }}
          title="Cycle replay speed"
        >
          {(speed / 1000).toFixed(1)}s
        </button>
      </div>
    </div>
  );
}
