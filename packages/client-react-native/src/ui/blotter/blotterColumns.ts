/** The prototype's `1.15fr 1fr 0.95fr 0.8fr` grid-template-columns for the
 * Blotter's PAIR·DIR / NOTIONAL / RATE / STATUS columns, expressed as RN
 * `flex` ratios (RN has no CSS grid). Shared by `BlotterHeader` and `TradeRow`
 * so the header and the trade rows beneath it cannot drift out of alignment. */
export const BLOTTER_COLUMN_FLEX = {
  pair: 1.15,
  notional: 1,
  rate: 0.95,
  status: 0.8,
} as const;
