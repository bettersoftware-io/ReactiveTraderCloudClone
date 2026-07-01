export interface DepthLevel {
  readonly price: number;
  readonly size: number;
}

export interface DepthBook {
  readonly symbol: string;
  readonly bids: readonly DepthLevel[];
  readonly asks: readonly DepthLevel[];
}
