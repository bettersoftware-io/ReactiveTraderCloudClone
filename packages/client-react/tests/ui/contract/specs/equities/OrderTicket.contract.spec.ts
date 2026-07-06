import { OrderTicket } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
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
