import { describeReferenceDataPortContract } from "@rtc/domain/ports/__contracts__/ReferenceDataPortContract";
import { referenceDataFrame } from "@rtc/shared/__fixtures__/wireFrames";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

describeReferenceDataPortContract("wsRealReferenceData", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
  return {
    port: ports.referenceData,
    driver: {
      snapshotPairs: async () => {
        // queueMicrotask so the port's ws.send() runs before we emit
        await Promise.resolve();
        ws.emit("stream.referenceData", referenceDataFrame());
      },
    },
    teardown: () => ws.dispose(),
  };
});
