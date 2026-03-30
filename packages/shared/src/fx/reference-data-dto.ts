import type { BulkSoWMessage } from "../protocol/sow.js";

export interface CurrencyPairUpdateDto {
  readonly symbol: string;
  readonly ratePrecision: number;
  readonly pipsPosition: number;
}

export type ReferenceDataMessage = BulkSoWMessage<CurrencyPairUpdateDto>;
