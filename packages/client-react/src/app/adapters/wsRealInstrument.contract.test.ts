import { describeInstrumentPortContract } from "@rtc/domain/ports/__contracts__/InstrumentPortContract";
import {
  instrumentStartOfSoW,
  instrumentEndOfSoW,
  instrumentAdded,
} from "@rtc/shared/__fixtures__/wireFrames";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";

describeInstrumentPortContract("wsRealInstrument", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
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
    teardown: () => ws.dispose(),
  };
});
