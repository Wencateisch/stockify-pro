const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inr0Fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function inr(n: number | null | undefined, decimals: 0 | 2 = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return decimals === 0 ? inr0Fmt.format(n) : inrFmt.format(n);
}

/** ₹1,350.20 without a currency symbol (for tight table cells). */
export function price(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return numFmt.format(n);
}

export function signed(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(decimals);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}`;
}

export function signedInr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${inr(Math.abs(n))}`;
}

export function pct(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(decimals)}%`;
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return intFmt.format(n);
}

export function shares(n: number): string {
  return `${intFmt.format(n)} ${Math.abs(n) === 1 ? "share" : "shares"}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
