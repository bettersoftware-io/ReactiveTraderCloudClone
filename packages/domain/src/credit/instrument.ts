export interface Instrument {
  readonly id: number;
  readonly name: string;
  readonly cusip: string;
  readonly ticker: string;
  readonly maturity: string;
  readonly interestRate: number;
  readonly benchmark: string;
}
