import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { describeInstrumentPortContract } from "@rtc/domain/ports/__contracts__/InstrumentPortContract";
import {
  instrumentAdded,
  instrumentEndOfSoW,
  instrumentStartOfSoW,
} from "@rtc/shared/__fixtures__/wireFrames";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

describeInstrumentPortContract("wsRealInstrument", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws, {
    preferences: {} as PreferencesPort,
    auth: new AuthSimulator({}),
    sessionStore: new InMemorySessionStore(),
  });
  return {
    port: ports.instruments,
    driver: {
      emitInitialSoW: async () => {
        await Promise.resolve();
        ws.emit("stream.instrumentEvent", instrumentStartOfSoW());
        ws.emit("stream.instrumentEvent", instrumentAdded({ id: 100 }));
        ws.emit("stream.instrumentEvent", instrumentAdded({ id: 101 }));
        ws.emit("stream.instrumentEvent", instrumentEndOfSoW());
      },
      addInstrumentAfterSoW: async () => {
        ws.emit("stream.instrumentEvent", instrumentAdded({ id: 102 }));
      },
    },
    teardown: () => {
      return ws.dispose();
    },
  };
});
