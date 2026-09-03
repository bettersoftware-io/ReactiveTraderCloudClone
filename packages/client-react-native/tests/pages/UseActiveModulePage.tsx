// packages/client-react-native/tests/pages/UseActiveModulePage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import type { JSX } from "react";
import { Text } from "react-native";

import { ActiveModuleContext } from "#/ui/shell/hud/ActiveModuleContext";
import type { ModuleRoute } from "#/ui/shell/hud/moduleRoutes";
import { useActiveModule } from "#/ui/shell/hud/useActiveModule";
import { textContentOf } from "#tests/pages/support/textContent";

export interface UseActiveModulePage {
  /** `undefined` mounts the probe with no provider at all; `null` mounts an
   * explicit null provider; a route pins that module. */
  mount(pinned: ModuleRoute | null | undefined): Promise<void>;
  unmountAll(): Promise<void>;
  probeLabel(): string;
}

/** The framework surface for `useActiveModule.test.tsx`. */
export function useActiveModulePage(): UseActiveModulePage {
  return {
    async mount(pinned: ModuleRoute | null | undefined): Promise<void> {
      function Probe(): JSX.Element {
        const active = useActiveModule();
        return <Text testID="probe">{active.label}</Text>;
      }

      if (pinned === undefined) {
        await render(<Probe />);
        return;
      }

      await render(
        <ActiveModuleContext.Provider value={pinned}>
          <Probe />
        </ActiveModuleContext.Provider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    probeLabel(): string {
      return textContentOf(screen.getByTestId("probe"));
    },
  };
}
