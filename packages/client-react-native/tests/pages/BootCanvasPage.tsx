// packages/client-react-native/tests/pages/BootCanvasPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface BootCanvasPage {
  mount(element: ReactElement): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  awaitExists(testId: string): Promise<boolean>;
}

/** The framework surface for `BootCanvas.test.tsx`. Takes a caller-built
 * element rather than `BootCanvas`'s own props: the spec mounts either a bare
 * `<BootCanvas variant="..." />` or a `PinnedCanvas` harness wrapping it in a
 * `BootClockContext.Provider` built from a live `useSharedValue` — bespoke,
 * per-test wiring that stays spec-side (mirrors Wave A's NavTree/InspectorApp
 * pages, which take the composed element rather than reconstructing it). */
export function bootCanvasPage(): BootCanvasPage {
  return {
    async mount(element: ReactElement): Promise<void> {
      await renderWithTheme(element);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async awaitExists(testId: string): Promise<boolean> {
      await screen.findByTestId(testId);
      return true;
    },
  };
}
