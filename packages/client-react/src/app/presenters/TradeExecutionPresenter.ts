import { type Observable, Subject, tap } from "rxjs";

import {
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  ExecuteTradeUseCase,
  type ExecutionPort,
  type ExecutionStatus,
} from "@rtc/domain";

/** FX trade execution outcome — emitted by `executions$` after each subscribed execute(). */
export interface ExecutionOutcome {
  readonly symbol: string;

  readonly status: ExecutionStatus;
}

export class TradeExecutionPresenter {
  private readonly executionSubject$ = new Subject<ExecutionOutcome>();

  readonly executions$ = this.executionSubject$.asObservable();

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
