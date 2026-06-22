import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { Direction } from "@rtc/domain";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

/**
 * Transport-level RPC FAILURE (the underlying `ws.rpc()` Promise rejects —
 * e.g. the socket dropped mid-flight) — distinct from an application-level
 * nack (covered by the per-port *.errors.test.ts files). Every RPC-backed
 * port observable wraps its `await ws.rpc(...)` in a
 * `catch (e) { if (!cancelled) subscriber.error(e); }` arm; these drive that
 * arm and assert the rejection propagates to the subscriber unchanged.
 */
describe("wsReal RPC ports :: transport reject propagates to subscriber", () => {
  const boom = new Error("socket dropped");

  async function expectPropagates(
    subscribe: (
      ports: ReturnType<typeof createWsRealPorts>,
    ) => Promise<unknown>,
    rpcType: string,
  ): Promise<void> {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = subscribe(ports);
    await awaitPendingRpc(ws, rpcType);
    ws.rejectPendingRpc(rpcType, boom);
    await expect(promise).rejects.toBe(boom);
    ws.dispose();
  }

  it("pricing.getPriceHistory propagates a transport reject", () =>
    expectPropagates(
      (p) => firstValueFrom(p.pricing.getPriceHistory("EURUSD")),
      "rpc.getPriceHistory",
    ));

  it("pricing.getRfqQuote propagates a transport reject", () =>
    expectPropagates(
      (p) => firstValueFrom(p.pricing.getRfqQuote("EURUSD", 4)),
      "rpc.getPriceHistory",
    ));

  it("execution.executeTrade propagates a transport reject", () =>
    expectPropagates(
      (p) =>
        firstValueFrom(
          p.execution.executeTrade({
            currencyPair: "EURUSD",
            spotRate: 1.1,
            direction: Direction.Buy,
            notional: 1_000_000,
            dealtCurrency: "EUR",
          }),
        ),
      "rpc.executeTrade",
    ));

  it("workflow.createRfq propagates a transport reject", () =>
    expectPropagates(
      (p) =>
        firstValueFrom(
          p.workflow.createRfq({
            instrumentId: 1,
            dealerIds: [0],
            quantity: 1000,
            direction: Direction.Buy,
            expirySecs: 60,
          }),
        ),
      "rpc.createRfq",
    ));

  it("workflow.cancelRfq propagates a transport reject", () =>
    expectPropagates(
      (p) => firstValueFrom(p.workflow.cancelRfq(1)),
      "rpc.cancelRfq",
    ));

  it("workflow.quote propagates a transport reject", () =>
    expectPropagates(
      (p) => firstValueFrom(p.workflow.quote({ quoteId: 1, price: 100 })),
      "rpc.quote",
    ));

  it("workflow.pass propagates a transport reject", () =>
    expectPropagates((p) => firstValueFrom(p.workflow.pass(1)), "rpc.pass"));

  it("workflow.accept propagates a transport reject", () =>
    expectPropagates(
      (p) => firstValueFrom(p.workflow.accept(1)),
      "rpc.accept",
    ));

  it("admin.getThroughput propagates a transport reject", () =>
    expectPropagates(
      (p) => firstValueFrom(p.admin.getThroughput()),
      "admin.getThroughput",
    ));

  it("admin.setThroughput propagates a transport reject", () =>
    expectPropagates(
      (p) => firstValueFrom(p.admin.setThroughput(500)),
      "admin.setThroughput",
    ));
});
