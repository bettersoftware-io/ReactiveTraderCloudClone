// packages/client-react-native/src/ui/shell/hud/useShellTelemetry.test.tsx
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

// `useShellTelemetry` imports `useFrameCallback` + `runOnJS` + `useSharedValue`
// from reanimated; stub all three so the local override doesn't drop a
// binding the module loads. Motion is forced off so the meter is inert and
// the seed/frozen path is deterministic.
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
jest.mock("./useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: (): boolean => {
      return false;
    },
  };
});

const { ShellTelemetryContext } =
  require("./ShellTelemetryContext") as ShellTelemetryContextModule;

const { useShellTelemetry } =
  require("./useShellTelemetry") as UseShellTelemetryModule;

test("returns the frozen telemetry when a provider supplies it", async () => {
  await renderProbe({ fps: 60, latencyMs: 12 });
  expect(screen.getByText("60|12|09:47:03|V2.0-RN")).toBeTruthy();
});

test("falls back to decorative seeds with no provider", async () => {
  await renderProbe(null);
  expect(screen.getByText("60|12|09:47:03|V2.0-RN")).toBeTruthy();
});

interface FrozenTelemetryFixture {
  readonly fps: number;
  readonly latencyMs: number;
}

interface ShellTelemetryFixture {
  readonly fps: number;
  readonly latencyMs: number;
  readonly clock: string;
  readonly build: string;
}

interface SharedValueStub<T> {
  value: T;
}

interface ShellTelemetryContextModule {
  ShellTelemetryContext: React.Context<FrozenTelemetryFixture | null>;
}

interface UseShellTelemetryModule {
  useShellTelemetry: () => ShellTelemetryFixture;
}

// Probe lives nested inside the helper (not at module scope) so the file has
// no unexported top-level component — mirrors ThemeProvider.test.tsx /
// useShellMotionEnabled.test.tsx and satisfies Biome's
// useComponentExportOnlyModules.
function renderProbe(frozen: FrozenTelemetryFixture | null): Promise<unknown> {
  function Probe(): React.JSX.Element {
    const t = useShellTelemetry();
    return <Text>{`${t.fps}|${t.latencyMs}|${t.clock}|${t.build}`}</Text>;
  }

  if (frozen === null) {
    return render(<Probe />);
  }

  return render(
    <ShellTelemetryContext.Provider value={frozen}>
      <Probe />
    </ShellTelemetryContext.Provider>,
  );
}
