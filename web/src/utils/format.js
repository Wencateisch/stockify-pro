const priceFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const formatPrice = (value = 0) => `\u20b9${priceFormat.format(value)}`;

export const formatCompact = (value = 0) => {
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} K`;
  return String(value);
};

export const formatPercent = (value = 0) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export const formatTime = (iso) => {
  if (!iso) return '--:--:--';
  return new Date(iso).toLocaleTimeString('en-IN', { hour12: false });
};
