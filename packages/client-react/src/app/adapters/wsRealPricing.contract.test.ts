import { describePricingPortContract } from "@rtc/domain/ports/__contracts__/PricingPortContract";
import {
  priceHistoryResponse,
  priceTickFrame,
} from "@rtc/shared/__fixtures__/wireFrames";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

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
        ws.nextRpcResponse(
          "rpc.getPriceHistory",
          priceHistoryResponse(_symbol),
        );
      },
      ackRfqQuote: async (_symbol) => {
        // getRfqQuote reuses rpc.getPriceHistory — confirmed in portFactory.ts
        await awaitPendingRpc(ws, "rpc.getPriceHistory");
        ws.nextRpcResponse(
          "rpc.getPriceHistory",
          priceHistoryResponse(_symbol),
        );
      },
    },
    teardown: () => ws.dispose(),
  };
});
