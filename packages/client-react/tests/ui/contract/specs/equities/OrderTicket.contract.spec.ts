import { act } from "@testing-library/react";
import { OrderTicket } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { EquityQuote } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("OrderTicket — place order → fill", () => {
  it("submits a market buy and walks to filled as the lifecycle pushes", async () => {
    const ticket = mount(OrderTicket, { props: { symbol: "AAPL" } });

    await ticket.setQty(100);
    await ticket.submit();
    expect(ticket.phase()).toBe("submitting");

    ticket.pushLifecycle({ status: "working", filledQty: 0 });
    expect(ticket.phase()).toBe("working");

    ticket.pushLifecycle({ status: "partiallyFilled", filledQty: 50 });
    expect(ticket.phase()).toBe("partiallyFilled");

    ticket.pushLifecycle({ status: "filled", filledQty: 100 });
    expect(ticket.phase()).toBe("filled");
  });

  it("blocks submit with a validation error when qty is zero", async () => {
    const ticket = mount(OrderTicket, { props: { symbol: "AAPL" } });

    await ticket.submit();

    expect(ticket.phase()).toBe("editing");
    expect(ticket.error()).toMatch(/quantity/i);
  });

  it("flips the submit label when the side toggle is switched to sell", async () => {
    const ticket = mount(OrderTicket, { props: { symbol: "AAPL" } });

    expect(ticket.submitLabel()).toMatch(/buy aapl/i);
    await ticket.setSide("sell");
    expect(ticket.submitLabel()).toMatch(/sell aapl/i);
    // Explicitly re-selecting the already-active BUY toggle is a no-op but
    // exercises its click handler.
    await ticket.setSide("buy");
    expect(ticket.submitLabel()).toMatch(/buy aapl/i);
  });

  it("explicitly re-selecting the already-active MARKET toggle is a no-op", async () => {
    const ticket = mount(OrderTicket, { props: { symbol: "AAPL" } });

    expect(ticket.hasLimitField()).toBe(false);
    await ticket.setType("market");
    expect(ticket.hasLimitField()).toBe(false);
  });

  it("requires a limit price once the order type is set to limit", async () => {
    const ticket = mount(OrderTicket, { props: { symbol: "AAPL" } });

    await ticket.setType("limit");
    expect(ticket.hasLimitField()).toBe(true);

    await ticket.setQty(100);
    await ticket.submit();
    expect(ticket.phase()).toBe("editing");
    expect(ticket.error()).toMatch(/limit price/i);

    await ticket.setLimitPrice(190);
    await ticket.submit();
    expect(ticket.phase()).toBe("submitting");
  });

  it("renders a rejection and resets back to an editable ticket", async () => {
    const ticket = mount(OrderTicket, { props: { symbol: "AAPL" } });

    await ticket.setQty(100);
    await ticket.submit();
    ticket.pushLifecycle({ status: "rejected", filledQty: 0 });
    expect(ticket.phase()).toBe("rejected");

    await ticket.reset();
    expect(ticket.phase()).toBe("editing");
  });
});

describe("OrderTicket — symbol defaults to the shared eqWorkspace selection", () => {
  it("trades the workspace's selected symbol when no symbol prop is given", () => {
    const ticket = mount(OrderTicket, {
      equities: { initialSymbol: "MSFT" },
    });

    expect(ticket.submitLabel()).toMatch(/buy msft/i);
  });

  // C1 regression: the docked ticket (no `symbol` prop) mounts its machine
  // once and must stay synced when the shared workspace selection changes
  // AFTER mount — the exact live bug was "select MSFT, CTA says BUY MSFT,
  // submit places an AAPL order" because the machine's form.symbol was
  // frozen at the mount-time selection.
  it("re-syncs the traded symbol when the workspace selection changes after mount, and submits the NEW symbol", async () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { initialSymbol: "AAPL" },
    );
    const ticket = mountWith(world, OrderTicket, {});

    expect(ticket.submitLabel()).toMatch(/buy aapl/i);

    act(() => {
      world.eqWorkspace.intents.select("MSFT");
    });

    // The CTA (and every other affordance) already tracked the new symbol
    // before the fix — the bug was invisible until you looked at what
    // actually got placed.
    expect(ticket.submitLabel()).toMatch(/buy msft/i);

    await ticket.setQty(100);
    await ticket.submit();
    expect(ticket.phase()).toBe("submitting");

    expect(ticket.placedSymbols()).toEqual(["MSFT"]);
  });

  it("does not retarget an in-flight order when the selection changes mid-submission", async () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { initialSymbol: "AAPL" },
    );
    const ticket = mountWith(world, OrderTicket, {});

    await ticket.setQty(100);
    await ticket.submit();
    expect(ticket.phase()).toBe("submitting");
    expect(ticket.placedSymbols()).toEqual(["AAPL"]);

    // Selection changes while the AAPL order is still in flight (submitting)
    // — must not clobber the in-flight state or its already-captured request.
    act(() => {
      world.eqWorkspace.intents.select("MSFT");
    });
    expect(ticket.phase()).toBe("submitting");

    ticket.pushLifecycle({ status: "working", filledQty: 0 });
    expect(ticket.phase()).toBe("working");
    expect(ticket.placedSymbols()).toEqual(["AAPL"]);

    ticket.pushLifecycle({ status: "filled", filledQty: 100 });
    expect(ticket.phase()).toBe("filled");

    // Once the ticket returns to editing (reset), it picks up the symbol
    // the workspace has selected in the meantime.
    await ticket.reset();
    expect(ticket.phase()).toBe("editing");
    expect(ticket.submitLabel()).toMatch(/buy msft/i);
  });
});

describe("OrderTicket — qty stepper", () => {
  it("steps the quantity by ±10 and floors at 0", async () => {
    const ticket = mount(OrderTicket, { props: { symbol: "AAPL" } });

    expect(ticket.qty()).toBe(0);
    await ticket.stepQtyUp();
    expect(ticket.qty()).toBe(10);
    await ticket.stepQtyUp();
    expect(ticket.qty()).toBe(20);
    await ticket.stepQtyDown();
    expect(ticket.qty()).toBe(10);

    // Floors at 0 — never goes negative.
    await ticket.stepQtyDown();
    await ticket.stepQtyDown();
    expect(ticket.qty()).toBe(0);
  });
});

describe("OrderTicket — Est. Cost", () => {
  it("prices a market order off the live quote's last", async () => {
    const ticket = mount(OrderTicket, {
      props: { symbol: "AAPL" },
      equities: { quotes: { AAPL: makeQuote(200) } },
    });

    await ticket.setQty(100);
    expect(ticket.estCost()).toBe("$20,000");
  });

  it("prices a limit order off the entered limit price once one is set", async () => {
    const ticket = mount(OrderTicket, {
      props: { symbol: "AAPL" },
      equities: { quotes: { AAPL: makeQuote(200) } },
    });

    await ticket.setType("limit");
    await ticket.setQty(100);
    // Limit type but no limit price entered yet — still prices off the live last.
    expect(ticket.estCost()).toBe("$20,000");

    await ticket.setLimitPrice(150);
    expect(ticket.estCost()).toBe("$15,000");
  });
});

function makeQuote(last: number): EquityQuote {
  return {
    symbol: "AAPL",
    bid: last - 0.05,
    ask: last + 0.05,
    last,
    changePct: 0,
    timestamp: 0,
  };
}
