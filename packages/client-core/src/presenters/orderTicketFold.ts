import type { OrderTicketForm, OrderTicketState } from "@rtc/core-api";
import type { EquityOrder, PlaceOrderRequest } from "@rtc/domain";

/** The ticket fold's accumulator: the state consumers see, and whether a
 * valid order is in flight — which gates stray form edits off. */
export interface OrderTicketAcc {
  readonly inFlight: boolean;
  readonly state: OrderTicketState;
}

export function createOrderTicketForm(defaultSymbol: string): OrderTicketForm {
  return { symbol: defaultSymbol, side: "buy", type: "market", qty: 0 };
}

export function createOrderTicketAcc(form: OrderTicketForm): OrderTicketAcc {
  return { inFlight: false, state: { phase: "editing", form, error: null } };
}

export function validateOrderTicket(form: OrderTicketForm): string | null {
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

export function orderToTicketPhase(order: EquityOrder): OrderTicketState {
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

export function toPlaceOrderRequest(form: OrderTicketForm): PlaceOrderRequest {
  return {
    symbol: form.symbol,
    side: form.side,
    type: form.type,
    qty: form.qty,
    limitPrice: form.limitPrice,
  };
}

/** One step of the ticket fold over CANDIDATE states — an `editing` from a
 * form edit, an `editing` with an error from a failed validation, or a
 * lifecycle phase from `place()`. A valid submit (`submitting`) sets
 * `inFlight`; a terminal phase or a validation error clears it; while in
 * flight a plain form edit is suppressed (the SAME `acc` comes back), so it
 * cannot clobber submitting/working/…. */
export function reduceOrderTicket(
  acc: OrderTicketAcc,
  next: OrderTicketState,
): OrderTicketAcc {
  if (next.phase === "submitting") {
    return { inFlight: true, state: next };
  }

  if (next.phase === "filled" || next.phase === "rejected") {
    return { inFlight: false, state: next };
  }

  if (next.phase === "editing" && next.error !== null) {
    return { inFlight: false, state: next };
  }

  if (acc.inFlight && next.phase === "editing" && next.error === null) {
    return acc;
  }

  return { inFlight: acc.inFlight, state: next };
}
