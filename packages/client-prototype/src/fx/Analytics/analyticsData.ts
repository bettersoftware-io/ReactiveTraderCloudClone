export interface PairPnl {
  pair: string;
  val: number;
  width: number;
  positive: boolean;
}

// PROTO 1297: static PnL sparkline — 11 y-values across a 300-wide viewBox.
const PNL_PTS = [92, 76, 84, 54, 64, 40, 48, 34, 22, 14, 8];
const PNL_N: number = PNL_PTS.length;

// PROTO 1300 `bars`: [pair, val (thousands), bar width %, positive].
export const PAIR_PNL: PairPnl[] = [
  { pair: "EURUSD", val: 13, width: 78, positive: true },
  { pair: "USDJPY", val: -4, width: 26, positive: false },
  { pair: "GBPUSD", val: 9, width: 58, positive: true },
  { pair: "AUDUSD", val: 6, width: 42, positive: true },
  { pair: "USDCAD", val: -2, width: 16, positive: false },
  { pair: "EURJPY", val: 5, width: 38, positive: true },
];

// PROTO 1297-1298: the polyline points, and the closed area path that drops to
// the 100-tall baseline for the gradient fill.
export const PNL_LINE = PNL_PTS.map((y, i) => {
  return `${Math.round((i / (PNL_N - 1)) * 300)},${y}`;
}).join(" ");

export const PNL_AREA = `M0,${PNL_PTS[0]} ${PNL_LINE} L300,100 L0,100 Z`;

// PROTO 1299: `+$17.1k`. pnl is floored at 0 so the sign is always +.
export function fmtPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}$${(Math.abs(pnl) / 1000).toFixed(1)}k`;
}

// PROTO 1300: bar value label, e.g. "+13k" / "-4k".
export function fmtBarVal(val: number): string {
  return `${val > 0 ? "+" : ""}${val}k`;
}
