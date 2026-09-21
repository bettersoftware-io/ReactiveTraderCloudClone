import { Effect, Stream, SubscriptionRef } from "effect";

import {
  createOrderTicketAcc,
  createOrderTicketForm,
  type OrderTicketAcc,
  type OrderTicketFormEvent,
  orderToTicketPhase,
  placeFailureToTicketPhase,
  reduceOrderTicket,
  reduceOrderTicketForm,
  toPlaceOrderRequest,
  validateOrderTicket,
} from "@rtc/client-core";
import type {
  Stream as CoreStream,
  Machine,
  OrderTicketForm,
  OrderTicketIntents,
  OrderTicketState,
} from "@rtc/core-api";
import type {
  EquityOrder,
  OrderSide,
  OrderType,
  PlaceOrderRequest,
} from "@rtc/domain";

import {
  createDetachedHost,
  refToStateStream,
  scopedPortStream,
  setRefIfChanged,
} from "#/bridge/out";
import { createRunSlot, type Run } from "#/machines/runSlot";

export interface OrderTicketDeps {
  place: (req: PlaceOrderRequest) => CoreStream<EquityOrder>;
  defaultSymbol: string;
}

/** The ticket on a `SubscriptionRef` and a run slot, under a DETACHED host
 * (one per mount, like `rfqTile`). The form and the fold accumulator are
 * plain mutable state; every candidate state goes through the imported
 * `reduceOrderTicket`, so the in-flight gate is the RxJS core's own rule —
 * a form edit made while an order is in flight returns the SAME accumulator,
 * which `setRefIfChanged` then drops. A valid `submit()` supersedes the
 * order in flight (the RxJS `switchMap`); an invalid one ends it too. A
 * failing `place()` is caught inside the build and lands on `rejected`
 * through the imported `placeFailureToTicketPhase` — the RxJS core's
 * `catchError` on the inner stream. `catchAll` sees FAILURES only, so a
 * superseding submit's interrupt still ends the run silently. */
export function createOrderTicketMachine(
  deps: OrderTicketDeps,
): Machine<OrderTicketState, OrderTicketIntents> {
  const host = createDetachedHost();
  let form = createOrderTicketForm(deps.defaultSymbol);
  let acc: OrderTicketAcc = createOrderTicketAcc(form);
  const ref = host.runtime.runSync(
    SubscriptionRef.make<OrderTicketState>(acc.state),
  );
  const slot = createRunSlot(host, ref);

  function offer(next: OrderTicketState): Effect.Effect<void> {
    return Effect.suspend(() => {
      acc = reduceOrderTicket(acc, next);
      const { state } = acc;
      return setRefIfChanged(ref, () => {
        return state;
      });
    });
  }

  /** A write made OUTSIDE a run — a form edit, a reset, the invalid-submit
   * error state. The slot only guards writes made through a `Run`, so
   * these carry their own disposal guard. */
  function edit(event: OrderTicketFormEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    form = reduceOrderTicketForm(form, event);
    host.runtime.runSync(offer({ phase: "editing", form, error: null }));
  }

  function patch(change: Partial<OrderTicketForm>): void {
    edit({ kind: "patch", change });
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      setSymbol: (symbol: string) => {
        patch({ symbol });
      },
      setSide: (side: OrderSide) => {
        patch({ side });
      },
      setType: (type: OrderType) => {
        patch({ type });
      },
      setQty: (qty: number) => {
        patch({ qty });
      },
      setLimitPrice: (limitPrice: number | undefined) => {
        patch({ limitPrice });
      },
      reset: () => {
        edit({
          kind: "reset",
          form: createOrderTicketForm(deps.defaultSymbol),
        });
      },
      submit: () => {
        if (slot.isDisposed()) {
          return;
        }

        const error = validateOrderTicket(form);

        if (error !== null) {
          slot.end();
          host.runtime.runSync(
            offer({ phase: "editing", form: { ...form }, error }),
          );
          return;
        }

        const request = toPlaceOrderRequest(form);
        slot.start((run: Run<OrderTicketState>) => {
          return run.guarded(offer({ phase: "submitting" })).pipe(
            Effect.andThen(
              scopedPortStream(() => {
                return deps.place(request);
              }).pipe(
                Stream.runForEach((order: EquityOrder) => {
                  return run.guarded(offer(orderToTicketPhase(order)));
                }),
                Effect.catchAll((failure: unknown) => {
                  return run.guarded(offer(placeFailureToTicketPhase(failure)));
                }),
              ),
            ),
          );
        });
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
