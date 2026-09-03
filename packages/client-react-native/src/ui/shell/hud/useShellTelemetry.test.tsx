// packages/client-react-native/src/ui/shell/hud/useShellTelemetry.test.tsx
import { expect, jest, test } from "@jest/globals";

import { useShellTelemetryPage } from "#tests/pages/UseShellTelemetryPage";

test("returns the frozen telemetry when a provider supplies it", async () => {
  const page = useShellTelemetryPage();
  await page.mount({ fps: 60, latencyMs: 12 });
  expect(page.hasProbeText()).toBe(true);
});

test("falls back to decorative seeds with no provider", async () => {
  const page = useShellTelemetryPage();
  await page.mount(null);
  expect(page.hasProbeText()).toBe(true);
});

// `useShellTelemetry` imports `useFrameCallback` + `runOnJS` + `useSharedValue`
// from reanimated; stub all three so the local override doesn't drop a
// binding the module loads. The `useFrameCallback` stub never invokes the
// worklet, so the meter is inert and the seed/frozen path is deterministic.
interface SharedValueStub<T> {
  value: T;
}

jest.mock("react-native-reanimated", () => {
  return {
    useFrameCallback: (): void => {
      return;
    },
    runOnJS: (fn: unknown): unknown => {
      return fn;
    },
    useSharedValue: <T,>(initial: T): SharedValueStub<T> => {
      return { value: initial };
    },
  };
});
