import { rpcNack } from "@rtc/shared/__fixtures__/wireFrames";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

describe("wsRealPricing :: error paths", () => {
  it("rejects getPriceHistory when RPC returns nack", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.pricing.getPriceHistory("EURUSD"));
    await awaitPendingRpc(ws, "rpc.getPriceHistory");
    ws.nextRpcResponse("rpc.getPriceHistory", rpcNack());
    await expect(promise).rejects.toThrow(/Failed to get price history/);
    ws.dispose();
  });

  it("rejects getRfqQuote when RPC returns empty payload", async () => {
    const ws = new FakeWsAdapter();
    const ports = createWsRealPorts(ws);
    const promise = firstValueFrom(ports.pricing.getRfqQuote("EURUSD", 4));
    await awaitPendingRpc(ws, "rpc.getPriceHistory");
    ws.nextRpcResponse("rpc.getPriceHistory", {
      type: "ack",
      payload: { prices: [] },
    });
    await expect(promise).rejects.toThrow(/No price available/);
    ws.dispose();
  });
});
