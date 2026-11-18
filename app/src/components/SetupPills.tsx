import { SETUP_LABELS, SETUP_DESCRIPTIONS } from "../lib/indicators";
import type { SetupKey } from "../lib/types";

const TONES: Record<SetupKey, string> = {
  breakout_20d: "green",
  bull_flag: "blue",
  reclaim_ma20: "violet",
  oversold: "red",
  oversold_bounce: "amber",
  orb: "green",
};

export function SetupPill({ setup }: { setup: SetupKey }) {
  return <span className={`pill ${TONES[setup]}`}>{SETUP_LABELS[setup]}</span>;
}

export function SetupPills({ setups, max = 3 }: { setups: SetupKey[]; max?: number }) {
  const shown = setups.slice(0, max);
  return (
    <div className="row wrap" style={{ gap: 5 }}>
      {shown.map((s) => (
        <SetupPill key={s} setup={s} />
      ))}
      {setups.length > max && <span className="pill">+{setups.length - max}</span>}
    </div>
  );
}

export function SetupExplainer({ setups }: { setups: SetupKey[] }) {
  if (!setups.length) return null;
  return (
    <div className="col" style={{ gap: 8 }}>
      {setups.map((s) => (
        <div key={s} className="row" style={{ alignItems: "flex-start", gap: 9 }}>
          <span style={{ marginTop: 2 }}>
            <SetupPill setup={s} />
          </span>
          <span className="tiny muted" style={{ lineHeight: 1.5, flex: 1 }}>
            {SETUP_DESCRIPTIONS[s]}
          </span>
        </div>
      ))}
    </div>
  );
}
