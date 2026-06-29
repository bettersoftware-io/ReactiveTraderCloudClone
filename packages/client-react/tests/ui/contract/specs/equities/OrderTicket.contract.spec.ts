import { OrderTicket } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

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
