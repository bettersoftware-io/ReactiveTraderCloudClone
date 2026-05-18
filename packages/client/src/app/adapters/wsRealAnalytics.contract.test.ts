import { describeAnalyticsPortContract } from "@rtc/domain/ports/__contracts__/AnalyticsPortContract";
import { analyticsFrame } from "@rtc/shared/__fixtures__/wireFrames";
import { createWsRealPorts } from "./portFactory";
import { FakeWsAdapter } from "./__test__/FakeWsAdapter";

describeAnalyticsPortContract("wsRealAnalytics", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws);
  return {
    port: ports.analytics,
    driver: {
      emitAnalytics: async () => {
        await Promise.resolve();
        ws.emit("stream.analytics", analyticsFrame());
      },
    },
    teardown: () => ws.dispose(),
  };
});
