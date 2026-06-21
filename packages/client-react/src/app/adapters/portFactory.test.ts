import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
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
