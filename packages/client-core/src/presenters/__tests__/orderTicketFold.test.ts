import { describe, expect, it } from "vitest";

import type { EquityOrder } from "@rtc/domain";

import {
  createOrderTicketAcc,
  createOrderTicketForm,
  orderToTicketPhase,
  reduceOrderTicket,
  toPlaceOrderRequest,
  validateOrderTicket,
} from "#/presenters/orderTicketFold";

describe("createOrderTicketForm", () => {
  it("defaults to a market buy of qty 0 for the given symbol", () => {
    expect(createOrderTicketForm("AAPL")).toEqual({
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 0,
    });
  });
});

describe("validateOrderTicket", () => {
  it("rejects a non-positive quantity", () => {
    expect(validateOrderTicket(createForm({ qty: 0 }))).toBe(
      "Quantity must be greater than zero",
    );
    expect(validateOrderTicket(createForm({ qty: -5 }))).toBe(
      "Quantity must be greater than zero",
    );
  });

  it("rejects a limit order with no limit price", () => {
    expect(validateOrderTicket(createForm({ qty: 10, type: "limit" }))).toBe(
      "Limit price required for a limit order",
    );
  });

  it("rejects a limit order with a non-positive limit price", () => {
    expect(
      validateOrderTicket(
        createForm({ qty: 10, type: "limit", limitPrice: 0 }),
      ),
    ).toBe("Limit price required for a limit order");
  });

  it("accepts a valid market order", () => {
    expect(validateOrderTicket(createForm({ qty: 10 }))).toBeNull();
  });

  it("accepts a valid limit order", () => {
    expect(
      validateOrderTicket(
        createForm({ qty: 10, type: "limit", limitPrice: 150 }),
      ),
    ).toBeNull();
  });
});

describe("orderToTicketPhase", () => {
  it("maps working/partiallyFilled/filled to the phase carrying the order", () => {
    const working = createOrder("working");
    expect(orderToTicketPhase(working)).toEqual({
      phase: "working",
      order: working,
    });

    const partial = createOrder("partiallyFilled");
    expect(orderToTicketPhase(partial)).toEqual({
      phase: "partiallyFilled",
      order: partial,
    });

    const filled = createOrder("filled");
    expect(orderToTicketPhase(filled)).toEqual({
      phase: "filled",
      order: filled,
    });
  });

  it("maps rejected to a phase carrying a fixed reason", () => {
    expect(orderToTicketPhase(createOrder("rejected"))).toEqual({
      phase: "rejected",
      reason: "Order rejected",
    });
  });

  it("maps new and cancelled to submitting", () => {
    expect(orderToTicketPhase(createOrder("new"))).toEqual({
      phase: "submitting",
    });
    expect(orderToTicketPhase(createOrder("cancelled"))).toEqual({
      phase: "submitting",
    });
  });
});

describe("toPlaceOrderRequest", () => {
  it("copies the five form fields", () => {
    const f = createForm({ qty: 10, type: "limit", limitPrice: 150 });
    expect(toPlaceOrderRequest(f)).toEqual({
      symbol: f.symbol,
      side: f.side,
      type: f.type,
      qty: f.qty,
      limitPrice: f.limitPrice,
    });
  });
});

describe("reduceOrderTicket", () => {
  it("submitting sets inFlight", () => {
    const acc = createOrderTicketAcc(createOrderTicketForm("AAPL"));
    const next = reduceOrderTicket(acc, { phase: "submitting" });
    expect(next.inFlight).toBe(true);
    expect(next.state).toEqual({ phase: "submitting" });
  });

  it("filled clears inFlight", () => {
    const acc: ReturnType<typeof createOrderTicketAcc> = {
      inFlight: true,
      state: { phase: "submitting" },
    };
    const filled = createOrder("filled");
    const next = reduceOrderTicket(acc, { phase: "filled", order: filled });
    expect(next.inFlight).toBe(false);
  });

  it("rejected clears inFlight", () => {
    const acc: ReturnType<typeof createOrderTicketAcc> = {
      inFlight: true,
      state: { phase: "submitting" },
    };

    const next = reduceOrderTicket(acc, {
      phase: "rejected",
      reason: "Order rejected",
    });
    expect(next.inFlight).toBe(false);
  });

  it("an editing state WITH an error clears inFlight", () => {
    const acc: ReturnType<typeof createOrderTicketAcc> = {
      inFlight: true,
      state: { phase: "submitting" },
    };

    const next = reduceOrderTicket(acc, {
      phase: "editing",
      form: createOrderTicketForm("AAPL"),
      error: "bad",
    });
    expect(next.inFlight).toBe(false);
  });

  it("while in flight, an editing state with no error is suppressed (same acc)", () => {
    const acc: ReturnType<typeof createOrderTicketAcc> = {
      inFlight: true,
      state: { phase: "submitting" },
    };

    const next = reduceOrderTicket(acc, {
      phase: "editing",
      form: createOrderTicketForm("AAPL"),
      error: null,
    });
    expect(next).toBe(acc);
  });

  it("any other state passes through, keeping inFlight", () => {
    const acc = createOrderTicketAcc(createOrderTicketForm("AAPL"));
    const working = createOrder("working");
    const next = reduceOrderTicket(acc, { phase: "working", order: working });
    expect(next.inFlight).toBe(acc.inFlight);
    expect(next.state).toEqual({ phase: "working", order: working });
  });
});

function createForm(
  overrides: Partial<ReturnType<typeof createOrderTicketForm>>,
): ReturnType<typeof createOrderTicketForm> {
  return { ...createOrderTicketForm("AAPL"), ...overrides };
}

function createOrder(status: EquityOrder["status"]): EquityOrder {
  return {
    id: "o1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 10,
    status,
    filledQty: status === "filled" ? 10 : 0,
    createdAt: 0,
  };
}
