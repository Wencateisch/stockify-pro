import { useApp } from "../lib/store";
import { useNow } from "../lib/hooks";
import { Icon } from "./Icons";
import { IstStamp } from "./IstClock";

const POLL_MS = 30_000;

/** One tap from anywhere: leave replay, switch to live and pull the quotes. */
export function GoLiveButton({ wide = false, label = "Go live" }: { wide?: boolean; label?: string }) {
  const goLive = useApp((s) => s.goLive);
  const busy = useApp((s) => s.liveLoading);
  return (
    <button
      type="button"
      className={`btn ${wide ? "primary" : "xs primary"} press`}
      disabled={busy}
      onClick={() => void goLive()}
    >
      {busy ? (
        <>
          <span className="spinner" /> Connecting…
        </>
      ) : (
        <>
          <Icon name="wifi" size={14} /> {label}
        </>
      )}
    </button>
  );
}

/**
 * Visible proof that the feed is alive: the exact time of the last completed
 * poll and a countdown/progress bar to the next one. Ticks once a second.
 */
export function LiveRefreshStatus({ bar = false }: { bar?: boolean }) {
  const lastAt = useApp((s) => s.lastLiveRefreshAt);
  const loading = useApp((s) => s.liveLoading);
  const error = useApp((s) => s.liveError);
  const refresh = useApp((s) => s.refreshLive);
  const now = useNow(1000);

  const remaining = lastAt ? Math.min(30, Math.max(0, Math.ceil((lastAt + POLL_MS - now) / 1000))) : 0;
  const progress = lastAt ? Math.min(100, Math.max(0, ((now - lastAt) / POLL_MS) * 100)) : 0;

  return (
    <div className="col" style={{ gap: 5 }}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="tiny muted">
          {loading
            ? "Refreshing live quotes…"
            : lastAt
              ? `Updated `
              : "Connecting to the public NSE feed…"}
          {!loading && lastAt && <IstStamp ts={lastAt} label="" timeOnly />}
          {!loading && lastAt && ` · next in ${remaining}s`}
        </span>
        <button
          type="button"
          className="link"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh live quotes now"
        >
          {loading ? "…" : "Refresh now"}
        </button>
      </div>
      {error && <span className="tiny down">{error}</span>}
      {bar && (
        <div className="refresh-bar" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
