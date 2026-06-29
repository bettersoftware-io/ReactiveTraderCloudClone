export interface EquityPosition {
  readonly symbol: string;
  readonly qty: number;
  readonly avgPrice: number;
  readonly markPrice: number;
  readonly unrealisedPnl: number;
}
