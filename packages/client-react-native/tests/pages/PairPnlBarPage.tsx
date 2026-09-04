// packages/client-react-native/tests/pages/PairPnlBarPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface PairPnlBarPage {
  mount(fraction: number, positive: boolean): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `PairPnlBar.test.tsx`.
 *
 * `PairPnlBar` is `require()`d lazily inside `mount()` rather than imported
 * at this module's top — mirrors `BlotterModulePage`'s identical ordering
 * trap: a static top-level import here would resolve `PairPnlBar`'s own
 * `useShellMotionEnabled` import before the spec's `mockMotion = jest.fn()`
 * exists (`jest.mock()` calls are hoisted above every `import`, but a page
 * module's own imports still run in the spec's normal import order).
 * Deferring the require into `mount()`, called from inside a `test()` body,
 * sidesteps the trap. Mirrors the base spec's own identical `require()`
 * placement, one file scope over. */
export function pairPnlBarPage(): PairPnlBarPage {
  return {
    async mount(fraction: number, positive: boolean): Promise<void> {
      const { PairPnlBar } =
        require("#/ui/analytics/PairPnlBar") as typeof import("#/ui/analytics/PairPnlBar");
      await renderWithTheme(
        <PairPnlBar fraction={fraction} positive={positive} />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
