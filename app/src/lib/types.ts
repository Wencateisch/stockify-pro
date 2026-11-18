/** [unixSeconds, open, high, low, close, volume] */
export type Bar = [number, number, number, number, number, number];

export interface Quote {
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  asOf: string;
}

export interface Instrument {
  symbol: string;
  yahoo: string;
  name: string;
  sector: string;
  quote: Quote;
  daily: Bar[];
  intraday: Bar[];
}

export interface MarketData {
  generatedAt: string;
  currency: string;
  exchange: string;
  source: string;
  session: { date: string; open: string; close: string };
  symbols: Instrument[];
}

export interface HistoryDoc {
  symbol: string;
  interval: string;
  bars: Bar[];
}

export type SetupKey =
  | "breakout_20d"
  | "bull_flag"
  | "reclaim_ma20"
  | "oversold"
  | "oversold_bounce"
  | "orb";

export interface SetupNumbers {
  rsi: number | null;
  rsiPrev: number | null;
  high20: number;
  ma20: number;
  runPct: number;
  range5Pct: number;
  atr: number;
  level: number;
}

export interface SetupHit {
  symbol: string;
  setups: SetupKey[];
  price: number;
  changePct: number;
  volume: number;
  rsi: number | null;
  numbers: SetupNumbers;
  closeDate: string;
}

export interface OrbHit {
  symbol: string;
  price: number;
  barIndex: number;
  barStart: number; // minutes after midnight IST
  closeAt: number; // minutes after midnight IST
  orHigh: number;
  orLow: number;
  pctOver: number;
  volume: number;
  range: number;
}

export interface Rules {
  capital: number;
  maxLossPerTrade: number;
  maxPositionPct: number;
  maxOrder: number;
  cashBufferPct: number;
  minOrder: number;
  maxTradesPerDay: number;
  maxOrdersPerDay: number;
  maxDailyLoss: number;
  minRewardRisk: number;
  requireStop: boolean;
  noEntriesBefore: string;
  noEntriesAfter: string;
  flatBy: string;
  blocked: string[];
  paper: boolean;
}

export type StopRule = "or-mid" | "or-low" | "pct" | "atr" | "price";
export type TargetRule = "1R" | "2R" | "price";

export interface PlanDraft {
  symbol: string;
  date: string;
  entry: number;
  stopRule: StopRule;
  stopParam?: number;
  targetRule: TargetRule;
  targetParam?: number;
  orHigh: number;
  orLow: number;
  orMinutes: number;
  atr: number;
  atrBars: number;
  entryMinutes: number;
  entryBar: number;
  setup: string;
  flatBy: string;
}

export interface PlanResult {
  entry: number;
  stop: number;
  target: number;
  riskPerShare: number;
  rewardRisk: number;
  targetR: number;
  stopLabel: string;
  stopDetail: string;
  targetLabel: string;
  riskPct: number;
}

export interface SizingLimit {
  name: string;
  usd: number;
  per: number;
  shares: number;
  how: string;
  binds: boolean;
}

export interface SizingResult {
  qty: number;
  entry: number;
  stop: number;
  target: number;
  riskPerShare: number;
  rewardRisk: number;
  cost: number;
  maxLoss: number;
  limits: SizingLimit[];
  boundBy: string;
  available: number;
  cashBuffer: number;
  refusal: string | null;
  orderType: "market";
}

export type Verdict = "PASS" | "BLOCK";

export interface RiskResult {
  verdict: Verdict;
  reasons: string[];
  warnings: string[];
  info: string[];
  maxLoss: number | null;
  riskPerShare: number | null;
  rewardRisk: number | null;
  value: number | null;
  usedToday: number;
  tradesToday: number;
  lossLimit: number;
  tradesLimit: number;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  name: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  riskPerShare: number;
  maxLoss: number;
  openedAt: number;
  entryTime: number;
  setup: string;
  date: string;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  name: string;
  qty: number;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  pnl: number;
  r: number;
  outcome: "target" | "stop" | "flat" | "manual";
  openedAt: number;
  closedAt: number;
  date: string;
  setup: string;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  price: number;
  dir: "above" | "below";
  /** Price when the alert was armed; used so a level is only ever crossed once. */
  baseline?: number;
  createdAt: number;
  triggeredAt: number | null;
  triggeredPrice: number | null;
}

export interface Settings {
  mode: "snapshot" | "replay" | "live";
  /** "direct" talks to the public Moneycontrol feed; "server" uses your own proxy. */
  liveSource: "direct" | "server";
  serverUrl: string;
  sound: boolean;
  haptics: boolean;
  selectedSession: string;
  replaySpeed: number;
}

export interface TMInput {
  symbol: string;
  entry: number;
  stop: number;
  target: number;
  entryMinutes: number;
  entryTimeLabel: string;
  orMinutes: number;
  orHigh: number;
  orLow: number;
  stopRule: string;
  risk: number;
  targetR: number;
  date: string;
  untilMinutes: number;
  replays: number;
  seed: number;
  bars: Bar[];
}

export interface TMTrade {
  date: string;
  time: string;
  entry: number;
  stop: number;
  target: number;
  outcome: "target" | "stop" | "close";
  r: number;
}

export interface TMOutput {
  replays: number;
  seed: number;
  window: number;
  barsLeft: number;
  pTarget: number;
  pStop: number;
  pNeither: number;
  pGreen: number;
  medianClose: number;
  p5Close: number;
  p95Close: number;
  avgR: number;
  rAtTarget: number;
  bands: number[][];
  bandTimes: number[];
  samplePaths: number[][];
  hist: { lo: number; hi: number; bins: number[] };
  poolSessions: number;
  poolFrom: string;
  poolTo: string;
  until: number;
  history: {
    sessions: number;
    triggered: number;
    target: number;
    stop: number;
    close: number;
    green: number;
    avgR: number | null;
    trades: TMTrade[];
    note?: string;
  };
  verdict: string;
  notes: string[];
  warnings: string[];
  shortSessions: number;
}
