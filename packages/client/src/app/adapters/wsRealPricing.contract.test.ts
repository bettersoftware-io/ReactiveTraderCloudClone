import { describePricingPortContract } from "@rtc/domain/ports/__contracts__/PricingPortContract";
import {
  priceTickFrame,
  priceHistoryResponse,
} from "@rtc/shared/__fixtures__/wireFrames";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";

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
        while (!ws.hasPendingRpc("rpc.getPriceHistory")) {
          await Promise.resolve();
        }
        ws.nextRpcResponse("rpc.getPriceHistory", priceHistoryResponse(_symbol));
      },
      ackRfqQuote: async (_symbol) => {
        // getRfqQuote reuses rpc.getPriceHistory — confirmed in portFactory.ts
        while (!ws.hasPendingRpc("rpc.getPriceHistory")) {
          await Promise.resolve();
        }
        ws.nextRpcResponse("rpc.getPriceHistory", priceHistoryResponse(_symbol));
      },
    },
    teardown: () => ws.dispose(),
  };
});
