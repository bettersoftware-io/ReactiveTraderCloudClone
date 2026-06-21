import {
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  ExecuteTradeUseCase,
  type ExecutionPort,
} from "@rtc/domain";
import type { Observable } from "rxjs";

export class TradeExecutionPresenter {
  constructor(private readonly execution: ExecutionPort) {}
  execute(input: ExecuteTradeInput): Observable<ExecuteTradeResult> {
    return new ExecuteTradeUseCase(this.execution).execute(input);
  }
}
