export interface PriceTickDto {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
  readonly valueDate: string;
  readonly creationTimestamp: number;
}

export interface PriceHistoryDto {
  readonly prices: readonly PriceTickDto[];
}
