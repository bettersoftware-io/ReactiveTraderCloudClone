// tests/presenter/scenarios/_shared/common.ts
import type {
  CurrencyPair,
  ExecutionStatus,
  RfqQuoteResult,
} from "@rtc/domain";

export interface PresenterScratchpad {
  firstPair?: CurrencyPair;
  lastTradeStatus?: ExecutionStatus;
  lastTradeNotional?: number;
  rejectedSeen?: boolean;
  rfqQuote?: RfqQuoteResult;
}

export function newScratchpad(): PresenterScratchpad {
  return {};
}
