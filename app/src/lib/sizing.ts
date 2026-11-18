import { TICK } from "./time";
import type { PlanResult, Rules, SizingLimit, SizingResult } from "./types";
import { roundTick } from "./plan";

const EPS = 1e-9;

/** Whole shares that fit inside `rupees` at `perShare`, using paise integers. */
export function sharesFor(rupees: number, perShare: number): number {
  const u = Math.round(rupees * 100);
  const p = Math.round(perShare * 100);
  if (p <= 0 || u <= 0) return 0;
  return Math.floor(u / p);
}

/**
 * Position sizing, transcribed from trader-budget/size.py: the smallest of the
 * max loss, the position cap, the max order and the cash after the buffer.
 * A stop too far away for the max loss is a plain refusal, not a smaller order.
 */
export function sizeTrade(
  plan: Pick<PlanResult, "entry" | "stop" | "target" | "riskPerShare" | "rewardRisk"> & { symbol: string },
  rules: Rules,
  cash?: number,
): SizingResult {
  const entry = roundTick(plan.entry);
  const stop = roundTick(plan.stop);
  const target = roundTick(plan.target);
  const risk = roundTick(entry - stop);
  const reward = roundTick(target - entry);
  const budget = Number(rules.capital) || 0;

  const cashBuffer = Math.round(budget * (rules.cashBufferPct / 100) * 100) / 100;
  let available = Math.max(0, Math.round((budget - cashBuffer) * 100) / 100);
  let cashNote = `budget minus the ${rules.cashBufferPct}% cash buffer`;

  if (cash !== undefined && cash !== null) {
    const cashAfterBuffer = Math.max(0, cash - cashBuffer);
    if (cashAfterBuffer < available - 0.005) {
      available = Math.round(cashAfterBuffer * 100) / 100;
      cashNote = `paper cash ${cash.toFixed(2)} minus the buffer`;
    }
  }

  const limits: SizingLimit[] = [];

  if (rules.maxLossPerTrade > 0) {
    limits.push({
      name: "max loss",
      usd: rules.maxLossPerTrade,
      per: risk,
      shares: sharesFor(rules.maxLossPerTrade, risk),
      how: `₹${fmt(rules.maxLossPerTrade)} / ₹${fmt(risk)} risk a share`,
      binds: false,
    });
  }
  if (rules.maxPositionPct > 0) {
    const cap = Math.round(budget * (rules.maxPositionPct / 100) * 100) / 100;
    limits.push({
      name: "position cap",
      usd: cap,
      per: entry,
      shares: sharesFor(cap, entry),
      how: `${rules.maxPositionPct}% of ₹${fmt(budget)} = ₹${fmt(cap)} / ₹${fmt(entry)}`,
      binds: false,
    });
  }
  if (rules.maxOrder > 0) {
    limits.push({
      name: "max order",
      usd: rules.maxOrder,
      per: entry,
      shares: sharesFor(rules.maxOrder, entry),
      how: `₹${fmt(rules.maxOrder)} / ₹${fmt(entry)}`,
      binds: false,
    });
  }
  limits.push({
    name: "cash",
    usd: available,
    per: entry,
    shares: sharesFor(available, entry),
    how: `${cashNote} = ₹${fmt(available)} / ₹${fmt(entry)}`,
    binds: false,
  });

  const qty = Math.max(0, Math.min(...limits.map((l) => l.shares)));
  const bound = limits.filter((l) => l.shares === qty).map((l) => l.name);
  const boundBy = bound[0] || "cash";
  limits.forEach((l) => {
    l.binds = l.name === boundBy;
  });

  const cost = Math.round(qty * entry * 100) / 100;
  const maxLoss = Math.round(qty * risk * 100) / 100;
  let refusal: string | null = null;

  if (qty === 0) {
    if (boundBy === "max loss") {
      refusal = `One share risks ₹${fmt(risk)} (entry ₹${fmt(entry)} − stop ₹${fmt(
        stop,
      )}), more than your ₹${fmt(rules.maxLossPerTrade)} max loss per trade. No order. Skip it, or plan a closer stop.`;
    } else {
      const lim = limits.find((l) => l.name === boundBy);
      refusal = `One share of ${plan.symbol} costs ₹${fmt(entry)}, more than your ${boundBy} limit${
        lim ? ` (${lim.how})` : ""
      }. No order.`;
    }
  } else if (plan.rewardRisk < rules.minRewardRisk - 1e-9) {
    refusal = `Reward:risk ${plan.rewardRisk.toFixed(2)} (target ₹${fmt(target)}, entry ₹${fmt(
      entry,
    )}, stop ₹${fmt(stop)}) is under your minimum ${rules.minRewardRisk.toFixed(2)}. The risk gate would block it. No order.`;
  } else if (cost < rules.minOrder - 0.005) {
    refusal = `${qty} share${qty === 1 ? "" : "s"} of ${plan.symbol} is ₹${fmt(cost)}, under your ₹${fmt(
      rules.minOrder,
    )} minimum order. No order.`;
  }

  return {
    qty,
    entry,
    stop,
    target,
    riskPerShare: risk,
    rewardRisk: plan.rewardRisk,
    cost,
    maxLoss,
    limits,
    boundBy,
    available,
    cashBuffer,
    refusal,
    orderType: "market",
  };
}

export function tickSize(): number {
  return TICK;
}

export function fmt(x: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(x);
}

export function bracketOrder(s: SizingResult, symbol: string, setup: string, entryTime: string, flatBy: string) {
  if (s.refusal || s.qty <= 0) return null;
  return {
    symbol,
    side: "buy" as const,
    qty: String(s.qty),
    type: "market" as const,
    time_in_force: "day" as const,
    order_class: "bracket" as const,
    take_profit_limit_price: s.target.toFixed(2),
    stop_loss_stop_price: s.stop.toFixed(2),
    plan: {
      entry: s.entry,
      stop: s.stop,
      target: s.target,
      risk_per_share: s.riskPerShare,
      max_loss: s.maxLoss,
      setup,
      entry_time: entryTime,
      flat_by: flatBy,
    },
  };
}

export function sizingLimitText(s: SizingResult): string {
  const map: Record<string, string> = {
    "max loss": "max loss per trade",
    "position cap": "position cap",
    "max order": "max order",
    cash: "cash after the buffer",
  };
  return map[s.boundBy] || s.boundBy;
}

export { EPS };
