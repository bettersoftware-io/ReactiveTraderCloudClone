import { describe, it, expect } from "vitest";
import { firstValueFrom } from "rxjs";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";
import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";

describe("wsRealPricing :: error paths", () => {
  it("rejects getPriceHistory when RPC returns nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.pricing.getPriceHistory("EURUSD"));
    while (!ws.hasPendingRpc("rpc.getPriceHistory")) {
      await Promise.resolve();
    }
    ws.nextRpcResponse("rpc.getPriceHistory", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to get price history/);
    ws.dispose();
  });

  it("rejects getRfqQuote when RPC returns empty payload", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.pricing.getRfqQuote("EURUSD", 4));
    while (!ws.hasPendingRpc("rpc.getPriceHistory")) {
      await Promise.resolve();
    }
    ws.nextRpcResponse("rpc.getPriceHistory", {
      type: "ack",
      payload: { prices: [] },
    });
    await expect(promise).rejects.toThrow(/No price available/);
    ws.dispose();
  });
});
