// packages/client-react-native/tests/pages/RadialCommandDockPage.tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

import { DockOpenContext } from "#/ui/shell/hud/DockOpenContext";
import { RadialCommandDock } from "#/ui/shell/hud/RadialCommandDock";

export interface RadialCommandDockPage {
  mount(startOpen?: boolean): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  pressFab(): Promise<void>;
  pressSatellite(key: string): Promise<void>;
  satelliteNumberOfLines(label: string): number | undefined;
  fabShowsGlyph(glyph: string): boolean;
}

/** The framework surface for `RadialCommandDock.test.tsx`. Relies on the
 * spec's own `jest.mock` calls (expo-router, expo-blur,
 * useShellMotionEnabled, safe-area, theme) — hoisted above every import in
 * the spec file, including its import of this page module. */
export function radialCommandDockPage(): RadialCommandDockPage {
  return {
    async mount(startOpen?: boolean): Promise<void> {
      if (startOpen === undefined) {
        await render(<RadialCommandDock />);
        return;
      }

      await render(
        <DockOpenContext.Provider value={startOpen}>
          <RadialCommandDock />
        </DockOpenContext.Provider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async pressFab(): Promise<void> {
      await fireEvent.press(screen.getByTestId("hud-dock-fab"));
    },
    async pressSatellite(key: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(`hud-dock-sat-${key}`));
    },
    satelliteNumberOfLines(label: string): number | undefined {
      return screen.getByText(label).props.numberOfLines;
    },
    fabShowsGlyph(glyph: string): boolean {
      return (
        within(screen.getByTestId("hud-dock-fab")).queryByText(glyph) != null
      );
    },
  };
}
