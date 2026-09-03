// packages/client-react-native/tests/pages/UseShellMotionEnabledPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { Text } from "react-native";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";

export interface UseShellMotionEnabledPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  hasText(text: "on" | "off"): boolean;
}

/** The framework surface for `useShellMotionEnabled.test.tsx`. */
export function shellMotionEnabledPage(): UseShellMotionEnabledPage {
  return {
    async mount(): Promise<void> {
      // Probe lives nested inside `mount` (not at module scope) so this
      // module has no unexported top-level component — satisfies Biome's
      // `useComponentExportOnlyModules`.
      function Probe(): JSX.Element {
        return <Text>{useShellMotionEnabled() ? "on" : "off"}</Text>;
      }

      await render(<Probe />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasText(text: "on" | "off"): boolean {
      return screen.queryByText(text) != null;
    },
  };
}
