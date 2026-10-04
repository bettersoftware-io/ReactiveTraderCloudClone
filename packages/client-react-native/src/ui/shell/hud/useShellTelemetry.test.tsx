// packages/client-react-native/src/ui/shell/hud/useShellTelemetry.test.tsx
import { afterEach, expect, jest, test } from "@jest/globals";

import type { BuildStamp } from "#/ui/shell/buildStamp";
import { shellTelemetryPage } from "#tests/pages/UseShellTelemetryPage";

afterEach(() => {
  return page.unmountAll();
});

test("returns the frozen telemetry when a provider supplies it", async () => {
  await page.mount({ fps: 60, latencyMs: 12 });
  expect(page.probeText()).toBe("60|12|09:47:03|V2.0-RN");
});

test("falls back to decorative seeds with no provider", async () => {
  await page.mount(null);
  expect(page.probeText()).toBe("60|12|09:47:03|V2.0-RN");
});

// A published build answers "which build is this?" on every screen: the build
// cell prints the commit it was bundled from.
test("prints the commit of a published build in the build cell", async () => {
  mockStamp = { commit: "f0482c5", builtAt: "2026-10-04T15:20Z" };

  try {
    await page.mount(null);
    expect(page.probeText()).toBe("60|12|09:47:03|f0482c5");
  } finally {
    mockStamp = null;
  }
});

// The frozen branch is what the visual harness renders. A golden that carried
// a commit would change on every publish.
test("keeps the static tag under frozen telemetry, stamp or not", async () => {
  mockStamp = { commit: "f0482c5", builtAt: "2026-10-04T15:20Z" };

  try {
    await page.mount({ fps: 60, latencyMs: 12 });
    expect(page.probeText()).toBe("60|12|09:47:03|V2.0-RN");
  } finally {
    mockStamp = null;
  }
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

const page = shellTelemetryPage();

let mockStamp: BuildStamp | null = null;

jest.mock("#/ui/shell/buildStamp", () => {
  return {
    get BUILD_STAMP(): BuildStamp | null {
      return mockStamp;
    },
  };
});
