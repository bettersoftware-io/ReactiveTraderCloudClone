import {
  createOrderTicketAcc,
  createOrderTicketForm,
  orderToTicketPhase,
  reduceOrderTicket,
  toPlaceOrderRequest,
  validateOrderTicket,
} from "@rtc/client-core";
import type {
  Machine,
  OrderTicketForm,
  OrderTicketIntents,
  OrderTicketState,
  Stream,
} from "@rtc/core-api";
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
 * `switchMap` switches to the error). A failing `place()` has no channel on
 * a Store: it is rethrown on a macrotask and the ticket stays `submitting`
 * (slice 2 ruling 8; slice 4 ruling 12). */
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

  function patch(change: Partial<OrderTicketForm>): void {
    if (slot.isDisposed()) {
      return;
    }

    form = { ...form, ...change };
    offer({ phase: "editing", form, error: null });
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
        patch(createOrderTicketForm(deps.defaultSymbol));
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
          await relay(deps.place(request), run.signal, (order) => {
            run.ifCurrent(() => {
              offer(orderToTicketPhase(order));
            });
          });
        });
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
