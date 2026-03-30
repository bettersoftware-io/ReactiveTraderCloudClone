export interface CurrencyPairPositionDto {
  readonly symbol: string;
  readonly basePnl: number;
  readonly baseTradedAmount: number;
  readonly counterTradedAmount: number;
}

export interface HistoricPositionDto {
  readonly timestamp: string;
  readonly usdPnl: number;
}

export interface AnalyticsDto {
  readonly currentPositions: readonly CurrencyPairPositionDto[];
  readonly history: readonly HistoricPositionDto[];
}
