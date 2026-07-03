import type { MarkerEvent } from "../protocol/sow.js";

export interface InstrumentDto {
  readonly id: number;
  readonly name: string;
  readonly cusip: string;
  readonly ticker: string;
  readonly maturity: string;
  readonly interestRate: number;
  readonly benchmark: string;
  readonly refPrice: number;
}

export type InstrumentEvent = MarkerEvent<InstrumentDto>;
