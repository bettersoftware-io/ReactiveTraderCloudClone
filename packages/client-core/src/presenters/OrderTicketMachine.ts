import { type StateObservable, state } from "@rx-state/core";
import { concat, merge, type Observable, of, Subject } from "rxjs";
import { map, scan, startWith, switchMap } from "rxjs/operators";

import type {
  EquityOrder,
  OrderSide,
  OrderType,
  PlaceOrderRequest,
} from "@rtc/domain";

import type { Machine } from "./machine";

interface OrderTicketForm {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number;
}

export type OrderTicketState =
  | { phase: "editing"; form: OrderTicketForm; error: string | null }
  | { phase: "submitting" }
  | { phase: "working"; order: EquityOrder }
  | { phase: "partiallyFilled"; order: EquityOrder }
  | { phase: "filled"; order: EquityOrder }
  | { phase: "rejected"; reason: string };

export interface OrderTicketIntents {
  setSymbol(symbol: string): void;
  setSide(side: OrderSide): void;
  setType(type: OrderType): void;
  setQty(qty: number): void;
  setLimitPrice(price: number | undefined): void;
  submit(): void;
  reset(): void;
}

export interface OrderTicketDeps {
  place: (req: PlaceOrderRequest) => Observable<EquityOrder>;
  defaultSymbol: string;
}

type Patch = Partial<OrderTicketForm>;

function validate(form: OrderTicketForm): string | null {
  if (form.qty <= 0) {
    return "Quantity must be greater than zero";
  }

  if (
    form.type === "limit" &&
    (form.limitPrice === undefined || form.limitPrice <= 0)
  ) {
    return "Limit price required for a limit order";
  }

  return null;
}

function orderToPhase(order: EquityOrder): OrderTicketState {
  switch (order.status) {
    case "working":
      return { phase: "working", order };
    case "partiallyFilled":
      return { phase: "partiallyFilled", order };
    case "filled":
      return { phase: "filled", order };
    case "rejected":
      return { phase: "rejected", reason: "Order rejected" };
    default:
      return { phase: "submitting" };
  }
}

export function createOrderTicketMachine(
  deps: OrderTicketDeps,
): Machine<OrderTicketState, OrderTicketIntents> {
  const patch$ = new Subject<Patch>();
  const submit$ = new Subject<void>();
  const reset$ = new Subject<void>();

  const initialForm: OrderTicketForm = {
    symbol: deps.defaultSymbol,
    side: "buy",
    type: "market",
    qty: 0,
  };

  // Editing form folds patches; resets restore the default.
  const form$ = merge(
    patch$,
    reset$.pipe(
      map(() => {
        return { ...initialForm } as Patch;
      }),
    ),
  ).pipe(
    scan((acc, p) => {
      return { ...acc, ...p };
    }, initialForm),
    startWith(initialForm),
  );

  let currentForm = initialForm;
  const formSub = form$.subscribe((f) => {
    currentForm = f;
  });

  // Each submit: if invalid → stay editing with error; if valid → submitting then
  // lifecycle updates from place(). An inFlight scan gates off stray editing$
  // emissions while a valid submission is in progress.
  const submissions$: Observable<OrderTicketState> = submit$.pipe(
    switchMap(() => {
      const error = validate(currentForm);

      if (error) {
        return of<OrderTicketState>({
          phase: "editing",
          form: { ...currentForm },
          error,
        });
      }

      const req: PlaceOrderRequest = {
        symbol: currentForm.symbol,
        side: currentForm.side,
        type: currentForm.type,
        qty: currentForm.qty,
        limitPrice: currentForm.limitPrice,
      };
      // Emit "submitting" immediately, then lifecycle updates from place().
      return concat(
        of<OrderTicketState>({ phase: "submitting" }),
        deps.place(req).pipe(map(orderToPhase)),
      );
    }),
  );

  // Track whether a valid submit is in flight so editing$ is gated off. A valid
  // submit sets inFlight=true; a terminal state (filled/rejected) clears it.
  // This prevents a stray form emission from clobbering the submitting/working/...
  // states if the form ever re-emits while the lifecycle is running.
  type InFlightAcc = { inFlight: boolean; state: OrderTicketState };
  const stream$: Observable<OrderTicketState> = merge(
    form$.pipe(
      map((form): OrderTicketState => {
        return { phase: "editing", form, error: null };
      }),
    ),
    submissions$,
  ).pipe(
    scan(
      (acc: InFlightAcc, next: OrderTicketState): InFlightAcc => {
        if (next.phase === "submitting") {
          return { inFlight: true, state: next };
        }

        if (next.phase === "filled" || next.phase === "rejected") {
          return { inFlight: false, state: next };
        }

        if (next.phase === "editing" && next.error !== null) {
          return { inFlight: false, state: next };
        }

        // While in flight, suppress stray editing (null-error) emissions.
        if (acc.inFlight && next.phase === "editing" && next.error === null) {
          return acc;
        }

        return { inFlight: acc.inFlight, state: next };
      },
      {
        inFlight: false,
        state: {
          phase: "editing",
          form: initialForm,
          error: null,
        } as OrderTicketState,
      },
    ),
    map((acc) => {
      return acc.state;
    }),
  );

  const initial: OrderTicketState = {
    phase: "editing",
    form: initialForm,
    error: null,
  };
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
