export interface CurrencyPairPosition {
  readonly symbol: string;
  readonly basePnl: number;
  readonly baseTradedAmount: number;
  readonly counterTradedAmount: number;
}

export interface HistoricPosition {
  readonly timestamp: string;
  readonly usdPnl: number;
}

export interface PositionUpdates {
  readonly currentPositions: readonly CurrencyPairPosition[];
  readonly history: readonly HistoricPosition[];
}
