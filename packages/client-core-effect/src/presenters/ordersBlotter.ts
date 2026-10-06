import { Effect, Option, PubSub, Stream } from "effect";

import type { EquityFillSignal, OrdersBlotterPresenter } from "@rtc/core-api";
import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  firstPortEvent,
  scopedPortStream,
  sharedFold,
  streamToStream,
  switchedPortEvents,
} from "#/bridge/out";
import { createSyncRef } from "#/bridge/syncRef";

/** `fills$` is a `PubSub` (hot, no replay — slice 2's `executions$`: a
 * publish before a subscriber's fiber has subscribed reaches nobody).
 * `orders$` is a RETAINED fold: one query at once and one per refresh,
 * newest wins — a `switchedPortEvents` group of one, the query's first value
 * (`firstPortEvent` — `orders()` is a one-shot snapshot by its own doc,
 * slice 4 ruling 9), selected by a refresh COUNT. The count is a `SyncRef`,
 * so the selector hands a period its current value on subscribe — the
 * initial query — and every later refresh synchronously: none is lost,
 * where a `PubSub` signal read on a fiber dropped a refresh published within
 * three microtasks of the period's first subscribe (measured on 3.22.2).
 * The query is LAZY: the first subscriber opens the period, so a book set
 * after construction is the one the first `orders$` reader sees. `place()`
 * is the port's lifecycle stream under its own scope, tapping each update —
 * and its own failure ERRORS that stream rather than being rethrown out of
 * band: a per-call stream has an error channel. */
export function createOrdersBlotterPresenter(
  host: EffectHost,
  orders: OrderPort,
): OrdersBlotterPresenter {
  const fills = host.runtime.runSync(PubSub.unbounded<EquityFillSignal>());
  const refreshCount = createSyncRef(0);
  const refreshes$ = refreshCount.stateStream();

  function recordUpdate(order: EquityOrder): Effect.Effect<void> {
    return refreshCount
      .write((count) => {
        return count + 1;
      })
      .pipe(
        Effect.andThen(
          order.status === "filled"
            ? PubSub.publish(fills, { symbol: order.symbol })
            : Effect.void,
        ),
        Effect.asVoid,
      );
  }

  return {
    fills$: streamToStream(host, Stream.fromPubSub(fills)),
    orders$: sharedFold<readonly EquityOrder[]>(host, {
      retain: true,
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<readonly EquityOrder[]>, fromPort: FromPort) => {
        return fromPort
          .merged([
            switchedPortEvents(refreshes$, () => {
              return [
                firstPortEvent(orders.orders(), (book) => {
                  return book;
                }),
              ];
            }),
          ])
          .pipe(
            Stream.runForEach((book) => {
              return update(() => {
                return book;
              });
            }),
          );
      },
    }),
    place: (req: PlaceOrderRequest) => {
      return streamToStream(
        host,
        scopedPortStream(() => {
          return orders.place(req);
        }).pipe(Stream.tap(recordUpdate)),
      );
    },
  };
}
