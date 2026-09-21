import { Effect, Option, PubSub, Stream } from "effect";

import type { EquityFillSignal, OrdersBlotterPresenter } from "@rtc/core-api";
import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  scopedPortStream,
  sharedFold,
  streamToStream,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

/** `fills$` and the refresh signal are `PubSub`s (hot, no replay — slice 2's
 * `executions$`: a publish before a subscriber's fiber has subscribed
 * reaches nobody). `orders$` is a RETAINED fold: one query at once and one
 * per refresh, newest wins (`flatMap` with `switch`), each query's first
 * value (`rpc` — `orders()` is a one-shot snapshot by its own doc, slice 4
 * ruling 9). The query is LAZY: the first subscriber opens the period, so a
 * book set after construction is the one the first `orders$` reader sees.
 * `place()` is the port's lifecycle stream under its own scope, tapping each
 * update — and its own failure ERRORS that stream rather than being
 * rethrown out of band: a per-call stream has an error channel. */
export function createOrdersBlotterPresenter(
  host: EffectHost,
  orders: OrderPort,
): OrdersBlotterPresenter {
  const fills = host.runtime.runSync(PubSub.unbounded<EquityFillSignal>());
  const refreshes = host.runtime.runSync(PubSub.unbounded<void>());

  function recordUpdate(order: EquityOrder): Effect.Effect<void> {
    return PubSub.publish(refreshes, undefined).pipe(
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
      run: (update: FoldUpdate<readonly EquityOrder[]>) => {
        // `merge`, not `concat`: the PubSub subscription must exist from
        // the run's first step, not only after the initial query.
        return Stream.merge(
          Stream.make(undefined),
          Stream.fromPubSub(refreshes),
        ).pipe(
          Stream.flatMap(
            () => {
              return Stream.fromEffect(rpc(orders.orders()));
            },
            { switch: true },
          ),
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
