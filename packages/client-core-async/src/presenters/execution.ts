import type { ExecutionOutcome, TradeExecutionPresenter } from "@rtc/core-api";
import {
  type ExecuteTradeInput,
  ExecuteTradeUseCase,
  type ExecutionPort,
} from "@rtc/domain";

import { once } from "#/bridge/in";
import { promiseToStream, topicToStream } from "#/bridge/out";
import { createTopic } from "#/kernel/topic";
import { untilAborted } from "#/kernel/untilAborted";

/** `executions$` is hot with no replay — the RxJS `Subject`: a Topic whose
 * producer has no work of its own, so `publish` reaches exactly the
 * subscribers present at that moment and nobody when there are none.
 * `execute(input)` is a one-shot command: nothing happens until the returned
 * stream is subscribed; then the use case runs, the outcome is published,
 * and the stream emits the result and completes. Unsubscribing aborts the
 * in-flight port call. */
export function createTradeExecutionPresenter(
  execution: ExecutionPort,
): TradeExecutionPresenter {
  const useCase = new ExecuteTradeUseCase(execution);
  const outcomes = createTopic<ExecutionOutcome>((signal) => {
    return untilAborted(signal);
  });

  return {
    executions$: topicToStream(outcomes),
    execute: (input: ExecuteTradeInput) => {
      return promiseToStream(async (signal) => {
        const result = await once(useCase.execute(input), signal);
        outcomes.publish({ symbol: input.pair.symbol, status: result.status });
        return result;
      });
    },
  };
}
