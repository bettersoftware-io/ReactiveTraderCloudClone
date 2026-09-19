// packages/client-react-native/tests/pages/StatusStripPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";

import { ActiveModuleContext } from "#/ui/shell/hud/ActiveModuleContext";
import type { ModuleRoute } from "#/ui/shell/hud/moduleRoutes";
import { StatusStrip } from "#/ui/shell/hud/StatusStrip";
import { flattenStyleOf } from "#tests/pages/support/flattenStyle";
import { normalizeText, textContentOf } from "#tests/pages/support/textContent";

/** What a case may vary. */
interface StatusStripMountProps {
  /** Pins the module through `ActiveModuleContext`, overriding the pathname —
   * how the visual harness (mounted under `/__visual/<id>`, which the
   * pathname resolver reads as RATES) makes a framed golden say CREDIT.
   * Omitted = no provider, so the label comes from the mocked pathname. */
  pinnedModule?: ModuleRoute;
}

export interface StatusStripPage {
  mount(props?: StatusStripMountProps): Promise<void>;
  unmountAll(): Promise<void>;
  hasTextContent(testId: string, text: string): boolean;
  clearanceWidth(): number;
}

/** The framework surface for `StatusStrip.test.tsx`. It used to take a
 * caller-built wrapper, so the one case that pins a module composed the
 * `ActiveModuleContext.Provider` itself; the page now builds that provider
 * from a `pinnedModule` prop. Relies on the spec's
 * own `jest.mock` calls (expo-router, react-bindings, useShellTelemetry,
 * theme, safe-area), hoisted above every import in the spec file. */
export function statusStripPage(): StatusStripPage {
  return {
    async mount(props: StatusStripMountProps = {}): Promise<void> {
      const strip = <StatusStrip />;

      await render(
        props.pinnedModule === undefined ? (
          strip
        ) : (
          <ActiveModuleContext.Provider value={props.pinnedModule}>
            {strip}
          </ActiveModuleContext.Provider>
        ),
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasTextContent(testId: string, text: string): boolean {
      return (
        normalizeText(textContentOf(screen.getByTestId(testId))) ===
        normalizeText(text)
      );
    },
    // P8: the dock's FAB is painted over this strip by construction, so the
    // telemetry row must keep its centre clear or the cell under the hex is
    // invisible on every screen.
    clearanceWidth(): number {
      const flat = flattenStyleOf<ViewStyle>(
        screen.getByTestId("hud-dock-clearance"),
      );
      return typeof flat.width === "number" ? flat.width : 0;
    },
  };
}
