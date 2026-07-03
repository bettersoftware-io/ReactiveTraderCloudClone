/**
 * PROTO headline P&L format (dc.html L1299):
 * (pnl >= 0 ? "+" : "-") + "$" + (abs(pnl)/1000).toFixed(1) + "k"
 */
export function formatPnlHeadline(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}$${(Math.abs(pnl) / 1000).toFixed(1)}k`;
}

/**
 * PROTO per-pair bar value format (dc.html L1302): whole-k with explicit sign.
 */
export function formatPnlK(value: number): string {
  const k = Math.round(Math.abs(value) / 1000);
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${k}k`;
}
