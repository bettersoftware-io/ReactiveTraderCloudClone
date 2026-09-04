// packages/client-react-native/tests/pages/RatesModulePage.tsx
import { fireEvent, screen } from "@testing-library/react-native";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface RatesModulePage {
  mount(): Promise<void>;
  exists(testId: string): boolean;
  pressText(text: string): Promise<void>;
}

/** The framework surface for `RatesModule.test.tsx`.
 *
 * `RatesModule` is `require()`d lazily inside `mount()` rather than imported
 * at this module's top — mirrors `BlotterModulePage`'s identical ordering
 * trap: a static top-level import here would resolve `RatesModule`'s own
 * `@rtc/react-bindings`/`useShellMotionEnabled` imports before the spec's
 * `mockPairs = jest.fn()` exists (`jest.mock()` calls are hoisted above
 * every `import`, but a page module's own imports still run in the spec's
 * normal import order). Deferring the require into `mount()`, called from
 * inside a `test()` body, sidesteps the trap. Mirrors the base spec's own
 * identical `require()` placement, one file scope over. */
export function ratesModulePage(): RatesModulePage {
  return {
    async mount(): Promise<void> {
      const { RatesModule } =
        require("#/ui/rates/RatesModule") as typeof import("#/ui/rates/RatesModule");
      await renderWithTheme(<RatesModule />);
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async pressText(text: string): Promise<void> {
      await fireEvent.press(screen.getByText(text));
    },
  };
}
