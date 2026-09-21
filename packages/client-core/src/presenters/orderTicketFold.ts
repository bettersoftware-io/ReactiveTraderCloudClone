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

/** One step of the FORM fold. A setter's patch merges; a reset REPLACES —
 * spreading the default over the form would leave every optional field the
 * default lacks (`limitPrice`) behind, to ride along on the next order. */
export type OrderTicketFormEvent =
  | { readonly kind: "patch"; readonly change: Partial<OrderTicketForm> }
  | { readonly kind: "reset"; readonly form: OrderTicketForm };

export function reduceOrderTicketForm(
  form: OrderTicketForm,
  event: OrderTicketFormEvent,
): OrderTicketForm {
  if (event.kind === "reset") {
    return { ...event.form };
  }

  return { ...form, ...event.change };
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
      return { phase: "rejected", reason: ORDER_REJECTED_REASON };
    default:
      return { phase: "submitting" };
  }
}

/** Generic reason for a `place()` failure that carries no message of its
 * own — the wording `orderToTicketPhase` gives a rejected order. */
const ORDER_REJECTED_REASON = "Order rejected";

/** A FAILED `place()` call — a nack, a dropped socket — is a rejection the
 * user can retry from, not a dead machine: it lands on the same `rejected`
 * phase a rejected order does, carrying the failure's own message. */
export function placeFailureToTicketPhase(error: unknown): OrderTicketState {
  const reason =
    error instanceof Error && error.message.length > 0
      ? error.message
      : ORDER_REJECTED_REASON;

  return { phase: "rejected", reason };
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
