import type {
  Machine,
  OrderTicketForm,
  OrderTicketIntents,
  OrderTicketState,
  Stream,
} from "@rtc/core-api";
import {
  createOrderTicketAcc,
  createOrderTicketForm,
  type OrderTicketFormEvent,
  orderToTicketPhase,
  placeFailureToTicketPhase,
  reduceOrderTicket,
  reduceOrderTicketForm,
  toPlaceOrderRequest,
  validateOrderTicket,
} from "@rtc/core-logic";
import type {
  EquityOrder,
  OrderSide,
  OrderType,
  PlaceOrderRequest,
} from "@rtc/domain";

import { relay } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { createRunSlot } from "#/kernel/runSlot";
import { createStore } from "#/kernel/store";

export interface OrderTicketDeps {
  place: (req: PlaceOrderRequest) => Stream<EquityOrder>;
  defaultSymbol: string;
}

/** The ticket on a Store and a run slot. The form is plain mutable state;
 * every candidate state goes through the imported `reduceOrderTicket`, so
 * the in-flight gate is the RxJS core's own rule. A valid `submit()`
 * supersedes the order in flight; an invalid one ends it too (the RxJS
 * `switchMap` switches to the error). A failing `place()` is caught inside
 * the run and lands on `rejected` through the imported
 * `placeFailureToTicketPhase` — the RxJS core's `catchError` on the inner
 * stream; `ifCurrent` keeps a superseded run's failure off the ticket. */
export function createOrderTicketMachine(
  deps: OrderTicketDeps,
): Machine<OrderTicketState, OrderTicketIntents> {
  let form = createOrderTicketForm(deps.defaultSymbol);
  let acc = createOrderTicketAcc(form);
  const store = createStore<OrderTicketState>(acc.state);
  const slot = createRunSlot(store);

  function offer(next: OrderTicketState): void {
    acc = reduceOrderTicket(acc, next);
    store.set(acc.state);
  }

  function edit(event: OrderTicketFormEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    form = reduceOrderTicketForm(form, event);
    offer({ phase: "editing", form, error: null });
  }

  function patch(change: Partial<OrderTicketForm>): void {
    edit({ kind: "patch", change });
  }

  return {
    state$: storeToStateStream(store),
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
          offer({ phase: "editing", form: { ...form }, error });
          return;
        }

        const request = toPlaceOrderRequest(form);
        slot.start(async (run) => {
          run.ifCurrent(() => {
            offer({ phase: "submitting" });
          });

          try {
            await relay(deps.place(request), run.signal, (order) => {
              run.ifCurrent(() => {
                offer(orderToTicketPhase(order));
              });
            });
          } catch (failure: unknown) {
            run.ifCurrent(() => {
              offer(placeFailureToTicketPhase(failure));
            });
          }
        });
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
