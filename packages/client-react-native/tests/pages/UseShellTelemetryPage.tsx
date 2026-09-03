// packages/client-react-native/tests/pages/UseShellTelemetryPage.tsx
import { render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { Text } from "react-native";

import { ShellTelemetryContext } from "#/ui/shell/hud/ShellTelemetryContext";
import { useShellTelemetry } from "#/ui/shell/hud/useShellTelemetry";

interface FrozenTelemetryFixture {
  readonly fps: number;
  readonly latencyMs: number;
}

export interface UseShellTelemetryPage {
  mount(frozen: FrozenTelemetryFixture | null): Promise<void>;
  hasProbeText(): boolean;
}

/** The framework surface for `useShellTelemetry.test.tsx`. Both fixtures
 * this spec exercises settle on the SAME probe string, so the page exposes
 * `hasProbeText()` as a fixed-string existence check rather than a generic
 * text getter. */
export function useShellTelemetryPage(): UseShellTelemetryPage {
  return {
    async mount(frozen: FrozenTelemetryFixture | null): Promise<void> {
      // Probe lives nested inside `mount` (not at module scope) so this
      // module has no unexported top-level component — satisfies Biome's
      // `useComponentExportOnlyModules`.
      function Probe(): JSX.Element {
        const t = useShellTelemetry();
        return <Text>{`${t.fps}|${t.latencyMs}|${t.clock}|${t.build}`}</Text>;
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
    hasProbeText(): boolean {
      return screen.queryByText("60|12|09:47:03|V2.0-RN") != null;
    },
  };
}
