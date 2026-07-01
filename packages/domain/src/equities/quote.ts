export interface EquityQuote {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
  readonly changePct: number;
  readonly timestamp: number;
}
