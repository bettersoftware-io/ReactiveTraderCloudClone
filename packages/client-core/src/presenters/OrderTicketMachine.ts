import { type StateObservable, state } from "@rx-state/core";
import { concat, merge, type Observable, of, Subject } from "rxjs";
import { catchError, map, scan, startWith, switchMap } from "rxjs/operators";

import type {
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

import type { Machine } from "./machine";
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
} from "./orderTicketFold";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. `OrderTicketForm` was moved alongside `OrderTicketState`
 * (which embeds it in its "editing" variant) though not itself in Task 3's
 * move table — this file imports it back for local use (the patch
 * subject, `initialForm`) but does NOT re-export it, matching its original
 * (unexported) visibility here. */
export type { OrderTicketIntents, OrderTicketState };

export interface OrderTicketDeps {
  place: (req: PlaceOrderRequest) => Observable<EquityOrder>;
  defaultSymbol: string;
}

export function createOrderTicketMachine(
  deps: OrderTicketDeps,
): Machine<OrderTicketState, OrderTicketIntents> {
  const patch$ = new Subject<Partial<OrderTicketForm>>();
  const submit$ = new Subject<void>();
  const reset$ = new Subject<void>();

  const initialForm = createOrderTicketForm(deps.defaultSymbol);

  // Editing form folds patches; a reset REPLACES it with the default.
  const form$ = merge(
    patch$.pipe(
      map((change): OrderTicketFormEvent => {
        return { kind: "patch", change };
      }),
    ),
    reset$.pipe(
      map((): OrderTicketFormEvent => {
        return { kind: "reset", form: initialForm };
      }),
    ),
  ).pipe(scan(reduceOrderTicketForm, initialForm), startWith(initialForm));

  let currentForm = initialForm;
  const formSub = form$.subscribe((f) => {
    currentForm = f;
  });

  // Each submit: if invalid → stay editing with error; if valid → submitting then
  // lifecycle updates from place(). An inFlight scan gates off stray editing$
  // emissions while a valid submission is in progress.
  const submissions$: Observable<OrderTicketState> = submit$.pipe(
    switchMap(() => {
      const error = validateOrderTicket(currentForm);

      if (error) {
        return of<OrderTicketState>({
          phase: "editing",
          form: { ...currentForm },
          error,
        });
      }

      const req = toPlaceOrderRequest(currentForm);
      // Emit "submitting" immediately, then lifecycle updates from place().
      // A failing place() is caught HERE, on the inner stream: uncaught it
      // would error `state$` and kill the ticket for good.
      return concat(
        of<OrderTicketState>({ phase: "submitting" }),
        deps.place(req).pipe(
          map(orderToTicketPhase),
          catchError((error: unknown) => {
            return of(placeFailureToTicketPhase(error));
          }),
        ),
      );
    }),
  );

  // Track whether a valid submit is in flight so editing$ is gated off. A valid
  // submit sets inFlight=true; a terminal state (filled/rejected) clears it.
  // This prevents a stray form emission from clobbering the submitting/working/...
  // states if the form ever re-emits while the lifecycle is running.
  const stream$: Observable<OrderTicketState> = merge(
    form$.pipe(
      map((form): OrderTicketState => {
        return { phase: "editing", form, error: null };
      }),
    ),
    submissions$,
  ).pipe(
    scan(reduceOrderTicket, createOrderTicketAcc(initialForm)),
    map((acc) => {
      return acc.state;
    }),
  );

  const initial: OrderTicketState = createOrderTicketAcc(initialForm).state;
  const state$: StateObservable<OrderTicketState> = state(stream$, initial);
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      setSymbol: (symbol: string) => {
        patch$.next({ symbol });
      },
      setSide: (side: OrderSide) => {
        patch$.next({ side });
      },
      setType: (type: OrderType) => {
        patch$.next({ type });
      },
      setQty: (qty: number) => {
        patch$.next({ qty });
      },
      setLimitPrice: (limitPrice: number | undefined) => {
        patch$.next({ limitPrice });
      },
      submit: () => {
        submit$.next();
      },
      reset: () => {
        reset$.next();
      },
    },
    dispose: () => {
      patch$.complete();
      submit$.complete();
      reset$.complete();
      formSub.unsubscribe();
      warm.unsubscribe();
    },
  };
}
