import type { EquityFillSignal, OrdersBlotterPresenter } from "@rtc/core-api";
import type { EquityOrder, OrderPort, PlaceOrderRequest } from "@rtc/domain";

import { once } from "#/bridge/in";
import { portCallToStream, topicToStream } from "#/bridge/out";
import { spawn } from "#/kernel/spawn";
import { createTopic } from "#/kernel/topic";
import { untilAborted } from "#/kernel/untilAborted";

/** `fills$` and the refresh signal are hot with no replay — Topics whose
 * producer has no work of its own (slice 2's `executions$`). `orders$` is
 * the retained book: its producer queries `orders()` at once and again on
 * every refresh, the newest query winning (the RxJS `switchMap`), and takes
 * each query's FIRST value — `orders()` is a one-shot snapshot by its own
 * doc (slice 4 ruling 9). A refresh published while nobody has ever
 * subscribed `orders$` reaches nobody, as it reaches nobody on the RxJS
 * `Subject`; the first subscriber queries fresh anyway. `place()` is the
 * port's lifecycle stream, per call, lazily, tapping each update. */
export function createOrdersBlotterPresenter(
  orders: OrderPort,
  lifetime: AbortSignal,
): OrdersBlotterPresenter {
  const fills = createTopic<EquityFillSignal>((signal) => {
    return untilAborted(signal);
  });

  const refreshes = createTopic<void>((signal) => {
    return untilAborted(signal);
  });

  const book = createTopic<readonly EquityOrder[]>(
    (signal, publish) => {
      return new Promise<void>((resolve, reject) => {
        let query: AbortController | null = null;

        function queryBook(): void {
          query?.abort();
          const current = new AbortController();
          query = current;
          void spawn(async () => {
            const book = await once(orders.orders(), current.signal);

            // `once()`'s own abort guard only protects ITS promise (a
            // `settled` flag) — once that promise has resolved, a later
            // abort of `current.signal` no longer has anything to do. A
            // refresh arriving in the SAME tick as this resolution still
            // supersedes this query (a fresh `AbortController`), so the
            // one-microtask window between that resolve and this
            // continuation resuming needs its own check — the same
            // stale-write window `createRunSlot` closes for the machines
            // everywhere else (ADR-006).
            if (!current.signal.aborted) {
              publish(book);
            }
          }, reject);
        }

        const stopRefreshes = refreshes.subscribe(queryBook);
        signal.addEventListener(
          "abort",
          () => {
            query?.abort();
            stopRefreshes();
            resolve();
          },
          { once: true },
        );
        queryBook();
      });
    },
    { replay: true, retainUntil: lifetime },
  );

  return {
    fills$: topicToStream(fills),
    orders$: topicToStream(book),
    place: (req: PlaceOrderRequest) => {
      return portCallToStream(
        () => {
          return orders.place(req);
        },
        (order: EquityOrder) => {
          refreshes.publish();

          if (order.status === "filled") {
            fills.publish({ symbol: order.symbol });
          }
        },
      );
    },
  };
}
