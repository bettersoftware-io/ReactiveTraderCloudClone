import { describeDealerPortContract } from "@rtc/domain/ports/__contracts__/DealerPortContract";
import {
  dealerStartOfSoW,
  dealerEndOfSoW,
  dealerAdded,
} from "@rtc/shared/__fixtures__/wireFrames";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";

describeDealerPortContract("wsRealDealer", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
  return {
    port: ports.dealers,
    driver: {
      emitInitialSoW: async () => {
        await Promise.resolve();
        ws.emit("stream.dealerEvent", dealerStartOfSoW());
        ws.emit("stream.dealerEvent", dealerAdded({ id: 100 }));
        ws.emit("stream.dealerEvent", dealerAdded({ id: 101 }));
        ws.emit("stream.dealerEvent", dealerEndOfSoW());
      },
      addDealerAfterSoW: async () => {
        ws.emit("stream.dealerEvent", dealerAdded({ id: 102 }));
      },
    },
    teardown: () => ws.dispose(),
  };
});
