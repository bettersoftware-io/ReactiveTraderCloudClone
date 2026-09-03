// packages/client-react-native/tests/pages/UseShellTelemetryPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { Text } from "react-native";

import { ShellTelemetryContext } from "#/ui/shell/hud/ShellTelemetryContext";
import { useShellTelemetry } from "#/ui/shell/hud/useShellTelemetry";
import { textContentOf } from "#tests/pages/support/textContent";

interface FrozenTelemetryFixture {
  readonly fps: number;
  readonly latencyMs: number;
}

export interface UseShellTelemetryPage {
  mount(frozen: FrozenTelemetryFixture | null): Promise<void>;
  unmountAll(): Promise<void>;
  /** The probe's rendered `fps|latencyMs|clock|build` string — `null` only
   * if the probe never rendered at all. The spec owns the expected literal,
   * so a frozen-provider mount and the decorative-seed fallback settling on
   * the SAME string stays a visible, assertable fact in the spec. */
  probeText(): string | null;
}

/** The framework surface for `useShellTelemetry.test.tsx`. */
export function shellTelemetryPage(): UseShellTelemetryPage {
  return {
    async mount(frozen: FrozenTelemetryFixture | null): Promise<void> {
      // Probe lives nested inside `mount` (not at module scope) so this
      // module has no unexported top-level component — satisfies Biome's
      // `useComponentExportOnlyModules`.
      function Probe(): JSX.Element {
        const t = useShellTelemetry();
        return (
          <Text testID="probe">{`${t.fps}|${t.latencyMs}|${t.clock}|${t.build}`}</Text>
        );
      }

      if (frozen === null) {
        await render(<Probe />);
        return;
      }

      await render(
        <ShellTelemetryContext.Provider value={frozen}>
          <Probe />
        </ShellTelemetryContext.Provider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    probeText(): string | null {
      const probe = screen.queryByTestId("probe");
      return probe === null ? null : textContentOf(probe);
    },
  };
}
