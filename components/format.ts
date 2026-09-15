// Number formats shared by the usage screens.

const whole = new Intl.NumberFormat('en-GB');

export function formatInt(n: number) {
  return whole.format(Math.round(n));
}

// 1,284 / 12.9K / 4.2M
export function formatCompact(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return formatInt(n);
}

// Model costs are fractions of a cent per message, so small amounts keep two
// significant digits instead of rounding to $0.00.
export function formatUsd(n: number) {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toPrecision(2)}`;
  return `$${n.toFixed(2)}`;
}
