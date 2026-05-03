import type { Direction, TradeStatus } from "@rtc/domain";

export interface ExecutionRequestDto {
  readonly currencyPair: string;
  readonly spotRate: number;
  readonly valueDate: string;
  readonly direction: Direction;
  readonly notional: number;
  readonly dealtCurrency: string;
}

export interface ExecutionResponseDto {
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
