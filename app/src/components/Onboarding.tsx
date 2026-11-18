import { useState } from "react";
import { useApp } from "../lib/store";
import { Icon } from "./Icons";
import { Sheet } from "./Sheet";

const STEPS = [
  {
    title: "The desk",
    icon: "desk" as const,
    body: [
      "A Nifty 50 desk built around one complete day-trading loop: scan, time the entry, plan the exit, replay the odds, size in rupees, then pass the risk gate.",
      "Every price comes from a bundled Yahoo Finance NSE snapshot. Nothing is simulated, and every order is paper.",
    ],
  },
  {
    title: "Five setups, one range",
    icon: "radar" as const,
    body: [
      "The scanner runs the five Day Trader daily setups on real closes: 20-day breakout, bull flag, MA20 reclaim, oversold and oversold bounce.",
      "The opening-range tab waits for the first completed 5-minute bar to close above the 09:15–09:30 range high.",
    ],
  },
  {
    title: "Replay before you risk",
    icon: "sparkles" as const,
    body: [
      "The Time Machine replays 10,000 paths through 59 real NSE sessions, sampled around the same time of day, and reports how often the target or the stop came first.",
      "Then the exit planner, the four sizing limits and the pre-trade gate decide whether the order is allowed at all.",
    ],
  },
];

export function Onboarding() {
  const seen = useApp((s) => s.introSeen);
  const setSeen = useApp((s) => s.setIntroSeen);
  const [step, setStep] = useState(0);
  if (seen) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Sheet
      open
      onClose={() => setSeen(true)}
      title={s.title}
      sub="Stockify Pro · NSE day-trading desk"
      actions={
        <>
          {step > 0 && (
            <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            onClick={() => (last ? setSeen(true) : setStep(step + 1))}
          >
            {last ? "Open the desk" : "Continue"}
          </button>
        </>
      }
    >
      <div
        className="glass flat"
        style={{
          display: "grid",
          placeItems: "center",
          height: 118,
          borderRadius: 18,
          marginBottom: 14,
          background:
            "radial-gradient(70% 90% at 50% 0%, rgba(74,222,155,0.18), transparent 70%), rgba(255,255,255,0.035)",
        }}
      >
        <Icon name={s.icon} size={42} style={{ color: "var(--green)" }} />
      </div>
      <div className="col" style={{ gap: 10 }}>
        {s.body.map((p, i) => (
          <p key={i} className="small" style={{ color: "var(--ink-2)", lineHeight: 1.55 }}>
            {p}
          </p>
        ))}
      </div>
      <div className="row" style={{ gap: 6, justifyContent: "center", marginTop: 16 }}>
        {STEPS.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === step ? 18 : 6,
              height: 6,
              borderRadius: 99,
              background: i === step ? "var(--green)" : "rgba(255,255,255,0.18)",
              transition: "all .25s var(--ease)",
            }}
          />
        ))}
      </div>
      <p className="tiny muted center" style={{ marginTop: 12 }}>
        Education and tooling, not financial advice. Paper only.
      </p>
    </Sheet>
  );
}
