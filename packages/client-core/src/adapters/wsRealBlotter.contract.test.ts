import type { PreferencesPort } from "@rtc/domain";
import { describeBlotterPortContract } from "@rtc/domain/ports/__contracts__/BlotterPortContract";
import { blotterFrame, tradeFrame } from "@rtc/shared/__fixtures__/wireFrames";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { createWsRealPorts } from "./portFactory";

describeBlotterPortContract("wsRealBlotter", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws, { preferences: {} as PreferencesPort });
  let trades = [tradeFrame({ tradeId: 1 })];
  return {
    port: ports.blotter,
    driver: {
      emitInitialBlotter: async () => {
        await Promise.resolve();
        ws.emit("stream.blotter", blotterFrame(trades));
      },
      appendTrade: async () => {
        trades = [...trades, tradeFrame({ tradeId: 2 })];
        ws.emit("stream.blotter", blotterFrame(trades));
      },
    },
    teardown: () => {
      return ws.dispose();
    },
  };
});
