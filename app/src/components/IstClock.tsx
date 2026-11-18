import { useNow } from "../lib/hooks";
import { dateLabel, istClockStr, istDateStr } from "../lib/time";

/**
 * Wall-clock IST with seconds. Owned by the top bar so every screen shows the
 * same time reference — useful when a live quote updates and you want to know
 * exactly when it happened. Ticks in this component only, not the whole app.
 */
export function IstClock({ withDate = false }: { withDate?: boolean }) {
  const now = useNow(1000);
  const stamp = istClockStr(now);
  return (
    <span className="ist-clock mono" title="Indian Standard Time · UTC+05:30" aria-label={`IST clock ${stamp}`}>
      {withDate && <span className="ist-date">{dateLabel(istDateStr(now))} · </span>}
      {stamp} <span className="ist-tz">IST</span>
    </span>
  );
}

/** Exact timestamp behind a price, always in IST, always with seconds. */
export function IstStamp({
  ts,
  label = "As of",
  className = "",
  timeOnly = false,
}: {
  ts: number;
  label?: string;
  className?: string;
  timeOnly?: boolean;
}) {
  if (!ts || !Number.isFinite(ts)) return null;
  return (
    <span className={`ist-stamp ${className}`} title="Feed timestamp in Indian Standard Time (UTC+05:30)">
      {label ? `${label} ` : ""}
      {timeOnly
        ? `${istClockStr(ts)} IST`
        : `${dateLabel(istDateStr(ts))} · ${istClockStr(ts)} IST`}
    </span>
  );
}
