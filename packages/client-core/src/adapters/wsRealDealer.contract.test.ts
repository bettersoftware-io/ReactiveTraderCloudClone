import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { describeDealerPortContract } from "@rtc/domain/ports/__contracts__/DealerPortContract";
import {
  dealerAdded,
  dealerEndOfSoW,
  dealerStartOfSoW,
} from "@rtc/shared/__fixtures__/wireFrames";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

describeDealerPortContract("wsRealDealer", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws, {
    preferences: {} as PreferencesPort,
    auth: new AuthSimulator({}),
    sessionStore: new InMemorySessionStore(),
  });
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
    teardown: () => {
      return ws.dispose();
    },
  };
});
