import { Effect, PubSub, Stream } from "effect";

import type { ExecutionOutcome, TradeExecutionPresenter } from "@rtc/core-api";
import {
  type ExecuteTradeInput,
  ExecuteTradeUseCase,
  type ExecutionPort,
} from "@rtc/domain";

import { type EffectHost, streamToStream } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

/** `executions$` is hot with no replay: a `PubSub` each subscriber drains on
 * its own fiber — a publish before that fiber has subscribed reaches nobody,
 * as it reaches nobody on an RxJS `Subject` with no observer (slice 2
 * ruling 12). `execute(input)` is a one-shot command: the port call is
 * suspended until the returned stream is subscribed, the outcome is
 * published, the result is emitted and the stream completes; unsubscribing
 * interrupts the fiber and with it the port subscription. */
export function createTradeExecutionPresenter(
  host: EffectHost,
  execution: ExecutionPort,
): TradeExecutionPresenter {
  const useCase = new ExecuteTradeUseCase(execution);
  const outcomes = host.runtime.runSync(PubSub.unbounded<ExecutionOutcome>());

  return {
    executions$: streamToStream(host, Stream.fromPubSub(outcomes)),
    execute: (input: ExecuteTradeInput) => {
      return streamToStream(
        host,
        Stream.fromEffect(
          Effect.suspend(() => {
            return rpc(useCase.execute(input));
          }).pipe(
            Effect.tap((result) => {
              return PubSub.publish(outcomes, {
                symbol: input.pair.symbol,
                status: result.status,
              });
            }),
          ),
        ),
      );
    },
  };
}
