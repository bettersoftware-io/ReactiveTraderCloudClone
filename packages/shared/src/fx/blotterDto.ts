import type { Direction, TradeStatus } from "@rtc/domain";

import type { BulkSoWMessage } from "../protocol/sow.js";

export interface TradeDto {
  readonly tradeId: number;
  readonly tradeName: string;
  readonly currencyPair: string;
  readonly notional: number;
  readonly dealtCurrency: string;
  readonly direction: Direction;
  readonly spotRate: number;
  readonly status: TradeStatus;
  readonly tradeDate: string;
  readonly valueDate: string;
}

export type BlotterMessage = BulkSoWMessage<TradeDto>;
