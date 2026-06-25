import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { Direction } from "@rtc/domain";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createSimulatorPorts, createWsRealPorts } from "./portFactory";

describe("createSimulatorPorts", () => {
  it("wires all nine transport ports with their port methods", () => {
    const ports = createSimulatorPorts();
    expect(typeof ports.referenceData.getCurrencyPairs).toBe("function");
    expect(typeof ports.pricing.getPriceUpdates).toBe("function");
    expect(typeof ports.execution.executeTrade).toBe("function");
    expect(typeof ports.blotter.getTradeStream).toBe("function");
    expect(typeof ports.analytics.getAnalytics).toBe("function");
    expect(typeof ports.instruments.getInstruments).toBe("function");
    expect(typeof ports.dealers.getDealers).toBe("function");
    expect(typeof ports.workflow.events).toBe("function");
    expect(typeof ports.admin.getThroughput).toBe("function");
  });
  it("threads the ExecutionSimulator into the blotter so the store emits", async () => {
    const ports = createSimulatorPorts();
    const first = await firstValueFrom(ports.blotter.getTradeStream());
    expect(Array.isArray(first)).toBe(true);
  });
});

describe("wsReal workflow :: quote/pass error paths", () => {
  it("rejects quote on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(
      ports.workflow.quote({ quoteId: 1, price: 100 }),
    );
    await awaitPendingRpc(ws, "rpc.quote");
    ws.nextRpcResponse("rpc.quote", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to submit quote/);
    ws.dispose();
  });
  it("rejects pass on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.workflow.pass(1));
    await awaitPendingRpc(ws, "rpc.pass");
    ws.nextRpcResponse("rpc.pass", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to pass on quote/);
    ws.dispose();
  });
});

describe("wsReal createRfq :: null-payload guard (line 472)", () => {
  it("throws when ack response has a null rfqId payload", async () => {
    // Exercises the `if (rfqId === undefined || rfqId === null)` branch in
    // createRfq (portFactory.ts:471-472). A server bug returning ack without a
    // numeric rfqId must not silently pass undefined downstream.
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(
      ports.workflow.createRfq({
        instrumentId: 1,
        dealerIds: [1],
        quantity: 1_000_000,
        direction: Direction.Buy,
        expirySecs: 120,
      }),
    );
    await awaitPendingRpc(ws, "rpc.createRfq");
    // Simulate an ack with no payload (null payload) — a defensive server bug
    ws.nextRpcResponse("rpc.createRfq", {
      type: "ack",
      payload: null as unknown as number,
    });
    await expect(promise).rejects.toThrow(/ack response missing payload/);
    ws.dispose();
  });
});

describe("wsReal admin.getThroughput :: null-payload guard (line 625)", () => {
  it("throws when ack response has a null throughput payload", async () => {
    // Exercises the `if (value === undefined || value === null)` branch in
    // getThroughput (portFactory.ts:624-625). A server returning ack without a
    // numeric value must not silently pass undefined downstream.
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.admin.getThroughput());
    await awaitPendingRpc(ws, "admin.getThroughput");
    ws.nextRpcResponse("admin.getThroughput", {
      type: "ack",
      payload: null as unknown as number,
    });
    await expect(promise).rejects.toThrow(/ack response missing payload/);
    ws.dispose();
  });
});
