let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** A short, soft two-note chime. No asset, no autoplay before a gesture. */
export function chime(kind: "alert" | "success" | "block" = "alert", enabled = true) {
  if (!enabled) return;
  try {
    const c = ctx();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    const notes = kind === "success" ? [660, 990] : kind === "block" ? [300, 220] : [880, 1180];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const t = c.currentTime + i * 0.09;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.055, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  } catch {
    /* audio is a nicety, never a failure */
  }
}

export function buzz(pattern: number | number[] = 12, enabled = true) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
