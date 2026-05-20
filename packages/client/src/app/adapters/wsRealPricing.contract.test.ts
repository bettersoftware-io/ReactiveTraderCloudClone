import { describePricingPortContract } from "@rtc/domain/ports/__contracts__/PricingPortContract";
import {
  priceTickFrame,
  priceHistoryResponse,
} from "@rtc/shared/__fixtures__/wireFrames";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";
import { awaitPendingRpc } from "./__test__/awaitPendingRpc";

describePricingPortContract("wsRealPricing", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
  return {
    port: ports.pricing,
    driver: {
      tickPrice: async (symbol) => {
        await Promise.resolve();
        // "stream.priceTick" is the server-side event name for price ticks
        ws.emit("stream.priceTick", priceTickFrame(symbol));
      },
      ackHistory: async (_symbol) => {
        // Poll until the port's getPriceHistory RPC is registered, then resolve it
        await awaitPendingRpc(ws, "rpc.getPriceHistory");
        ws.nextRpcResponse("rpc.getPriceHistory", priceHistoryResponse(_symbol));
      },
      ackRfqQuote: async (_symbol) => {
        // getRfqQuote reuses rpc.getPriceHistory — confirmed in portFactory.ts
        await awaitPendingRpc(ws, "rpc.getPriceHistory");
        ws.nextRpcResponse("rpc.getPriceHistory", priceHistoryResponse(_symbol));
      },
    },
    teardown: () => ws.dispose(),
  };
});
