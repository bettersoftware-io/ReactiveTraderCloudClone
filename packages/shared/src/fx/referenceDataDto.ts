import type { BulkSoWMessage } from "../protocol/sow.js";

export interface CurrencyPairUpdateDto {
  readonly symbol: string;
  readonly ratePrecision: number;
  readonly pipsPosition: number;
  readonly baseMid: number;
  readonly typicalSpreadPips: number;
}

export type ReferenceDataMessage = BulkSoWMessage<CurrencyPairUpdateDto>;
