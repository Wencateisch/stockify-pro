import type { MarketClock } from "./time";
import type { PaperPosition, RiskResult, Rules, Verdict } from "./types";
import { roundTick } from "./plan";

const EPS = 1e-9;

export interface RiskOrder {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  entry: number;
  stop?: number | null;
  target?: number | null;
  value?: number | null;
}

export interface RiskContext {
  rules: Rules;
  cash: number;
  positions: PaperPosition[];
  tradesToday: number;
  lossToday: number;
  ordersToday: number;
  duplicate: boolean;
  prices: Record<string, number>;
  clock: MarketClock;
}

/**
 * The pre-trade gate, transcribed from trader-risk/check.py.
 * Every entry needs a stop, the loss at that stop must fit the per-trade and
 * daily limits, R:R must clear the minimum, and the entry must be inside the
 * window. Exits are never blocked by a day limit.
 */
export function checkEntry(order: RiskOrder, ctx: RiskContext): RiskResult {
  const { rules } = ctx;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const sym = order.symbol.toUpperCase();
  const entry = roundTick(order.entry);
  const stop = order.stop != null ? roundTick(order.stop) : null;
  const target = order.target != null ? roundTick(order.target) : null;
  const qty = Math.floor(order.qty);
  const value = order.value ?? (qty > 0 ? qty * entry : null);

  const held = ctx.positions.filter((p) => p.symbol === sym);
  const heldQty = held.reduce((a, p) => a + p.qty, 0);
  const heldValue = held.reduce((a, p) => a + p.qty * (ctx.prices[p.symbol] ?? p.entry), 0);
  const totalAccount = ctx.cash + Object.entries(
    ctx.positions.reduce<Record<string, number>>((acc, p) => {
      acc[p.symbol] = (acc[p.symbol] || 0) + p.qty * (ctx.prices[p.symbol] ?? p.entry);
      return acc;
    }, {}),
  ).reduce((a, [, v]) => a + v, 0);

  // format / basic
  if (!(qty > 0)) reasons.push("format: the order needs a whole-share quantity above zero");

  // blocked list
  if (rules.blocked.map((b) => b.toUpperCase()).includes(sym)) {
    reasons.push(`blocked: ${sym} is on your blocked list`);
  }

  // size
  if (value != null) {
    if (value < rules.minOrder - 0.005) {
      reasons.push(`size: ₹${value.toFixed(2)} is under your ₹${rules.minOrder.toFixed(2)} minimum order`);
    }
    if (rules.maxOrder > 0 && value > rules.maxOrder + 0.005) {
      reasons.push(`size: ₹${value.toFixed(2)} is over your ₹${rules.maxOrder.toFixed(2)} max order`);
    }
  }

  // position cap
  if (value != null && totalAccount > 0) {
    const posAfter = heldValue + value;
    const cap = (totalAccount * rules.maxPositionPct) / 100;
    if (posAfter > cap + 0.005) {
      reasons.push(
        `position: ${sym} would be ₹${posAfter.toFixed(2)} (${((posAfter / totalAccount) * 100).toFixed(
          1,
        )}% of the ₹${totalAccount.toFixed(2)} account), over your ${rules.maxPositionPct}% cap`,
      );
    }
  }

  // cash + buffer
  if (value != null) {
    const afterCash = ctx.cash - value;
    const buffer = (totalAccount * rules.cashBufferPct) / 100;
    if (afterCash < -0.005) {
      reasons.push(
        `cash: needs ₹${value.toFixed(2)} but only ₹${ctx.cash.toFixed(2)} is free; that would be margin (borrowed money), which is off`,
      );
    } else if (afterCash < buffer - 0.005) {
      reasons.push(
        `cash: leaves ₹${Math.max(0, afterCash).toFixed(2)} cash, under your ${rules.cashBufferPct}% buffer of ₹${buffer.toFixed(
          2,
        )}`,
      );
    }
  }

  // duplicates and daily limits
  if (ctx.duplicate) reasons.push(`duplicate: a buy ${sym} was already placed today`);
  if (rules.maxOrdersPerDay > 0 && ctx.ordersToday + 1 > rules.maxOrdersPerDay) {
    reasons.push(`daily limit: ${ctx.ordersToday} orders today, your limit is ${rules.maxOrdersPerDay}`);
  }
  if (rules.maxTradesPerDay > 0 && ctx.tradesToday + 1 > rules.maxTradesPerDay) {
    reasons.push(`trades: ${ctx.tradesToday} entries today, your limit is ${rules.maxTradesPerDay} a day`);
  }

  // stop, loss, R:R
  let riskPerShare: number | null = null;
  let maxLoss: number | null = null;
  let rewardRisk: number | null = null;

  if (rules.requireStop && !stop) {
    reasons.push("stop: no stop. Every entry needs one (require stop is on). Plan the exit first.");
  } else if (stop && stop >= entry - 0.005) {
    reasons.push(`stop: the stop ₹${stop.toFixed(2)} must be below the entry ₹${entry.toFixed(2)} for a buy`);
  } else if (stop) {
    riskPerShare = roundTick(entry - stop);
    maxLoss = Math.round(qty * riskPerShare * 100) / 100;
    if (maxLoss > rules.maxLossPerTrade + 0.005) {
      reasons.push(
        `loss: ${qty} × ₹${riskPerShare.toFixed(2)} risk a share = ₹${maxLoss.toFixed(
          2,
        )} at the stop, over your ₹${rules.maxLossPerTrade.toFixed(2)} max loss per trade`,
      );
    }
    if (target != null) {
      if (target <= entry + 0.005) {
        reasons.push(`target: the target ₹${target.toFixed(2)} must be above the entry ₹${entry.toFixed(2)}`);
      } else {
        rewardRisk = Math.round((((target - entry) / riskPerShare) * 100)) / 100;
        if (rewardRisk < rules.minRewardRisk - 1e-9) {
          reasons.push(
            `reward:risk: ${rewardRisk.toFixed(2)} (target ₹${target.toFixed(2)}, entry ₹${entry.toFixed(
              2,
            )}, stop ₹${stop.toFixed(2)}) is under your minimum ${rules.minRewardRisk.toFixed(2)}`,
          );
        }
      }
    } else if (rules.minRewardRisk > 0) {
      reasons.push(`reward:risk: no target to measure it against (minimum ${rules.minRewardRisk.toFixed(2)})`);
    }
    if (rules.maxDailyLoss > 0 && maxLoss != null) {
      const used = ctx.lossToday;
      if (used + maxLoss > rules.maxDailyLoss + 0.005) {
        reasons.push(
          `daily loss: ₹${used.toFixed(2)} already at risk today plus ₹${maxLoss.toFixed(
            2,
          )} for this one = ₹${(used + maxLoss).toFixed(2)}, over your ₹${rules.maxDailyLoss.toFixed(2)} daily limit`,
        );
      }
    }
  }

  // market window
  if (!ctx.clock.allowEntries) {
    reasons.push(`window: ${windowReason(ctx.clock, rules)}`);
  }

  // info
  if (stop && riskPerShare) {
    info.push(
      `entry ₹${entry.toFixed(2)}, stop ₹${stop.toFixed(2)}, target ${
        target ? "₹" + target.toFixed(2) : "none"
      }: risk ₹${riskPerShare.toFixed(2)} a share`,
    );
    info.push(
      `max loss ₹${(maxLoss ?? 0).toFixed(2)}, reward:risk ${
        rewardRisk != null ? rewardRisk.toFixed(2) : "n/a"
      } (min ${rules.minRewardRisk.toFixed(2)})`,
    );
  }
  info.push(
    `today before this: ${ctx.tradesToday} of ${rules.maxTradesPerDay} trades, ₹${ctx.lossToday.toFixed(
      2,
    )} of ₹${rules.maxDailyLoss.toFixed(2)} daily loss`,
  );
  if (heldQty > 0) warnings.push(`you already hold ${heldQty} shares of ${sym}`);

  const verdict: Verdict = reasons.length ? "BLOCK" : "PASS";
  return {
    verdict,
    reasons,
    warnings,
    info,
    maxLoss,
    riskPerShare,
    rewardRisk,
    value: value != null ? Math.round(value * 100) / 100 : null,
    usedToday: ctx.lossToday,
    tradesToday: ctx.tradesToday,
    lossLimit: rules.maxDailyLoss,
    tradesLimit: rules.maxTradesPerDay,
  };
}

function windowReason(clock: MarketClock, rules: Rules): string {
  if (clock.status === "weekend") return "the market is closed today (weekend)";
  if (clock.status === "holiday") return clock.detail.replace("NSE closed · ", "NSE holiday: ");
  if (clock.status === "closed") return "the session has ended (15:30 IST)";
  if (clock.status === "pre-open") return `the session opens at 09:15 IST (it is ${clock.detail.split("·")[1]?.trim()})`;
  if (clock.minutes >= parseTime(rules.flatBy)) return `no new entries after the flat-by ${rules.flatBy}`;
  if (clock.minutes < parseTime(rules.noEntriesBefore)) return `no new entries before ${rules.noEntriesBefore} IST`;
  if (clock.minutes > parseTime(rules.noEntriesAfter)) return `no new entries after ${rules.noEntriesAfter} IST`;
  return "outside the entry window";
}

export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Closing is always allowed; only the record of the fill changes. */
export function exitAllowed(): boolean {
  return true;
}

export function riskColor(verdict: Verdict): string {
  return verdict === "PASS" ? "var(--green)" : "var(--red)";
}

export { EPS };
