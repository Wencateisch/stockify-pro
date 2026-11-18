import { TICK } from "./time";
import type { PlanDraft, PlanResult, StopRule, TargetRule } from "./types";

export class PlanError extends Error {}

export const STOP_LABELS: Record<StopRule, string> = {
  "or-mid": "OR midpoint",
  "or-low": "OR low",
  pct: "% under entry",
  atr: "ATR multiple",
  price: "Your price",
};

export const TARGET_LABELS: Record<TargetRule, string> = {
  "1R": "1R",
  "2R": "2R",
  price: "Price",
};

const EPS = 1e-9;
const MIN_RISK_PCT = 0.05;

export function roundTick(x: number): number {
  // Divide rather than multiply so 2187.2 does not become 2187.2000000000003.
  return Math.round((x + EPS) / TICK) / (1 / TICK);
}

/** A long's stop rounds down, away from the entry. */
export function floorTick(x: number): number {
  return Math.floor((x + EPS) / TICK) / (1 / TICK);
}

export function money2(x: number): string {
  return x.toFixed(2);
}

export interface PlanComputation {
  plan: PlanResult;
  warnings: string[];
}

/**
 * The exit planner, transcribed from trader-exit/exit.py.
 * Stop: OR midpoint (default for an ORB), OR low, a percent under the entry,
 * a multiple of ATR, or an explicit price. Target: 1R, 2R or a price.
 * Refuses a stop at/above entry, a target at/below entry and a stop tighter
 * than 0.05% of the price.
 */
export function computePlan(draft: PlanDraft): PlanComputation {
  const entry = roundTick(draft.entry);
  if (!(entry > 0)) throw new PlanError("The entry price must be above ₹0.");

  let raw: number;
  let stopLabel: string;
  let stopDetail = "";

  switch (draft.stopRule) {
    case "or-mid": {
      if (!(draft.orHigh > 0 && draft.orLow > 0)) {
        throw new PlanError("An OR-mid stop needs the opening range (high and low).");
      }
      const oh = roundTick(draft.orHigh);
      const ol = roundTick(draft.orLow);
      if (oh <= ol) throw new PlanError(`The opening-range high ₹${money2(oh)} must be above its low ₹${money2(ol)}.`);
      raw = (oh + ol) / 2;
      stopLabel = "opening-range midpoint";
      stopDetail = `(₹${money2(oh)} + ₹${money2(ol)}) / 2`;
      break;
    }
    case "or-low": {
      if (!(draft.orHigh > 0 && draft.orLow > 0)) {
        throw new PlanError("An OR-low stop needs the opening range (high and low).");
      }
      if (roundTick(draft.orHigh) <= roundTick(draft.orLow)) {
        throw new PlanError("The opening-range high must be above its low.");
      }
      raw = draft.orLow;
      stopLabel = "opening-range low";
      break;
    }
    case "pct": {
      const p = Number(draft.stopParam);
      if (!(p > 0) || p >= 100) throw new PlanError("A % stop needs a number above 0 and under 100.");
      raw = entry * (1 - p / 100);
      stopLabel = `${trimNum(p)}% under the entry`;
      stopDetail = `₹${money2(entry)} × (1 − ${trimNum(p)}%)`;
      break;
    }
    case "atr": {
      const k = Number(draft.stopParam);
      if (!(k > 0)) throw new PlanError("An ATR stop needs a multiple above 0.");
      if (!(draft.atr > 0)) throw new PlanError("No ATR: the session needs at least three closed 5-minute bars.");
      raw = entry - k * draft.atr;
      stopLabel = `${trimNum(k)} × ATR(${draft.atrBars}) under the entry`;
      stopDetail = `ATR ₹${draft.atr.toFixed(2)} over ${draft.atrBars} bars${
        draft.atrBars < 14 ? " (fewer than 14 so far)" : ""
      }`;
      break;
    }
    case "price": {
      const p = Number(draft.stopParam);
      if (!(p > 0)) throw new PlanError("A price stop needs a price above ₹0.");
      raw = p;
      stopLabel = "your price";
      break;
    }
    default:
      throw new PlanError("Unknown stop rule.");
  }

  const stop = floorTick(raw);
  if (!raw || !Number.isFinite(raw)) throw new PlanError("That stop does not work out to a price.");
  if (stopDetail) stopDetail += stop !== roundTick(raw) ? ", rounded down" : "";
  else if (stop !== roundTick(raw)) stopDetail = `₹${money2(raw)} rounded down`;

  if (stop >= entry) {
    throw new PlanError(
      `The stop ₹${money2(stop)} (${stopLabel}) is at or above the entry ₹${money2(entry)}: a long's stop goes under the entry.`,
    );
  }
  if (stop <= 0) throw new PlanError("That stop works out to ₹0 or less. Pick a stop above ₹0.");

  const risk = roundTick(entry - stop);
  const floorRisk = entry * (MIN_RISK_PCT / 100);
  if (risk < floorRisk - EPS) {
    const pctOfPrice = (risk / entry) * 100;
    throw new PlanError(
      `The stop is ₹${money2(risk)} under the entry (${pctOfPrice.toFixed(3)}%), less than 0.05% of the price (₹${money2(
        floorRisk,
      )}). Too tight to survive the spread — normal wiggle would stop you out. Widen it.`,
    );
  }

  let target: number;
  let targetR: number;
  let targetLabel: string;

  if (draft.targetRule === "price") {
    const p = Number(draft.targetParam);
    if (!(p > 0)) throw new PlanError("A price target needs a price above ₹0.");
    target = roundTick(p);
    targetR = (target - entry) / risk;
    targetLabel = `your price (${targetR.toFixed(2)}R)`;
  } else {
    targetR = draft.targetRule === "1R" ? 1 : 2;
    target = roundTick(entry + targetR * risk);
    targetLabel = `${targetR}R (${targetR === 1 ? "one" : "two"} times the risk)`;
  }

  if (target <= entry) {
    throw new PlanError(
      `The target ₹${money2(target)} is at or below the entry ₹${money2(entry)}: a long's target goes above it.`,
    );
  }

  const rewardRisk = Math.round(((target - entry) / risk) * 100) / 100;
  const warnings: string[] = [];
  if (targetR < 1) warnings.push("A target under 1R needs a very high hit rate to pay for the losses.");
  if (draft.entryMinutes >= parseFlat(draft.flatBy)) {
    warnings.push(`The entry at ${clock(draft.entryMinutes)} is at or after your flat-by ${draft.flatBy}: no time left to hold.`);
  }

  return {
    plan: {
      entry,
      stop,
      target,
      riskPerShare: risk,
      rewardRisk,
      targetR,
      stopLabel,
      stopDetail,
      targetLabel,
      riskPct: Math.round((risk / entry) * 10000) / 100,
    },
    warnings,
  };
}

export function parseFlat(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!m) return 15 * 60 + 15;
  return Number(m[1]) * 60 + Number(m[2]);
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const ampm = h < 12 ? "AM" : "PM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
