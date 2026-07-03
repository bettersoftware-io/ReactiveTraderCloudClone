export interface Instrument {
  readonly id: number;
  readonly name: string;
  readonly cusip: string;
  readonly ticker: string;
  readonly maturity: string;
  readonly interestRate: number;
  readonly benchmark: string;
  /** PROTO reference price (dc.html L758-763); demo quote anchor. */
  readonly refPrice: number;
}
