import { type Observable, Subject, tap } from "rxjs";

import type {
  ExecutionOutcome,
  TradeExecutionPresenter as TradeExecutionPresenterApi,
} from "@rtc/core-api";
import {
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  ExecuteTradeUseCase,
  type ExecutionPort,
} from "@rtc/domain";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 4) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { ExecutionOutcome };

export class TradeExecutionPresenter implements TradeExecutionPresenterApi {
  private readonly executionSubject$ = new Subject<ExecutionOutcome>();

  readonly executions$: Observable<ExecutionOutcome> =
    this.executionSubject$.asObservable();

  constructor(private readonly execution: ExecutionPort) {}

  execute(input: ExecuteTradeInput): Observable<ExecuteTradeResult> {
    return new ExecuteTradeUseCase(this.execution).execute(input).pipe(
      tap((result) => {
        this.executionSubject$.next({
          symbol: input.pair.symbol,
          status: result.status,
        });
      }),
    );
  }
}
