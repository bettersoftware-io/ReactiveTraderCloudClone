import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { describeReferenceDataPortContract } from "@rtc/domain/ports/__contracts__/ReferenceDataPortContract";
import { referenceDataFrame } from "@rtc/shared/__fixtures__/wireFrames";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

describeReferenceDataPortContract("wsRealReferenceData", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws, {
    preferences: {} as PreferencesPort,
    auth: new AuthSimulator({}),
    sessionStore: new InMemorySessionStore(),
  });
  return {
    port: ports.referenceData,
    driver: {
      snapshotPairs: async () => {
        // queueMicrotask so the port's ws.send() runs before we emit
        await Promise.resolve();
        ws.emit("stream.referenceData", referenceDataFrame());
      },
    },
    teardown: () => {
      return ws.dispose();
    },
  };
});
