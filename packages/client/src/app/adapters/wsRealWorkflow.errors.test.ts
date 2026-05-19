import { describe, it, expect } from "vitest";
import { firstValueFrom } from "rxjs";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";
import { Direction } from "@rtc/domain";

describe("wsRealWorkflow :: error paths", () => {
  const makeReq = () => ({
    instrumentId: 1,
    dealerIds: [0],
    quantity: 1000,
    direction: Direction.Buy,
    expirySecs: 60,
  });

  it("rejects createRfq on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.workflow.createRfq(makeReq()));
    while (!ws.hasPendingRpc("rpc.createRfq")) {
      await Promise.resolve();
    }
    ws.nextRpcResponse("rpc.createRfq", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to create RFQ/);
    ws.dispose();
  });

  it("rejects cancelRfq on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.workflow.cancelRfq(1));
    while (!ws.hasPendingRpc("rpc.cancelRfq")) {
      await Promise.resolve();
    }
    ws.nextRpcResponse("rpc.cancelRfq", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to cancel RFQ/);
    ws.dispose();
  });

  it("rejects accept on nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.workflow.accept(1));
    while (!ws.hasPendingRpc("rpc.accept")) {
      await Promise.resolve();
    }
    ws.nextRpcResponse("rpc.accept", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to accept quote/);
    ws.dispose();
  });
});
