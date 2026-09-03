// packages/client-react-native/tests/pages/StatusStripPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

import { StatusStrip } from "#/ui/shell/hud/StatusStrip";
import { textContentOf } from "#tests/pages/support/textContent";

export interface StatusStripPage {
  mount(wrapper?: (children: ReactElement) => ReactElement): Promise<void>;
  unmountAll(): void;
  hasTextContent(testId: string, text: string): boolean;
  clearanceWidth(): number;
}

/** The framework surface for `StatusStrip.test.tsx`. Relies on the spec's
 * own `jest.mock` calls (expo-router, react-bindings, useShellTelemetry,
 * theme, safe-area), hoisted above every import in the spec file. */
export function statusStripPage(): StatusStripPage {
  return {
    async mount(
      wrapper: (children: ReactElement) => ReactElement = (
        c: ReactElement,
      ): ReactElement => {
        return c;
      },
    ): Promise<void> {
      await render(wrapper(<StatusStrip />));
    },
    unmountAll(): void {
      cleanup();
    },
    hasTextContent(testId: string, text: string): boolean {
      return textContentOf(screen.getByTestId(testId)).includes(text);
    },
    // P8: the dock's FAB is painted over this strip by construction, so the
    // telemetry row must keep its centre clear or the cell under the hex is
    // invisible on every screen.
    clearanceWidth(): number {
      const flat = StyleSheet.flatten(
        screen.getByTestId("hud-dock-clearance").props.style as ViewStyle,
      );
      return typeof flat?.width === "number" ? flat.width : 0;
    },
  };
}
