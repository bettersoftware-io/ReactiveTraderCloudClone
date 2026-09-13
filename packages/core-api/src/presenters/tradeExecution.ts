import type {
  ExecuteTradeInput,
  ExecuteTradeResult,
  ExecutionStatus,
} from "@rtc/domain";

import type { Stream } from "#/stream";

/** FX trade execution outcome — emitted by `executions$` after each subscribed execute(). */
export interface ExecutionOutcome {
  readonly symbol: string;

  readonly status: ExecutionStatus;
}

export interface TradeExecutionPresenter {
  readonly executions$: Stream<ExecutionOutcome>;
  execute(input: ExecuteTradeInput): Stream<ExecuteTradeResult>;
}
