// packages/client-react-native/tests/pages/SpotTilePage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { CurrencyPair } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

export interface SpotTilePage {
  mount(
    pair: CurrencyPair,
    onOpenTicket: (pair: CurrencyPair) => void,
    theme?: RnTheme,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `SpotTile.test.tsx`.
 *
 * `SpotTile` is `require()`d lazily inside `mount()` rather than imported at
 * this module's top — mirrors `BlotterModulePage`'s identical ordering trap:
 * a static top-level import here would resolve `SpotTile`'s own
 * `@rtc/react-bindings`/`useShellMotionEnabled` imports before the spec's
 * `mockUsePrice = jest.fn()` exists. Deferring the require into `mount()`,
 * called from inside a `test()` body, sidesteps the trap. Mirrors the base
 * spec's own identical `require()` placement, one file scope over. */
export function spotTilePage(): SpotTilePage {
  return {
    async mount(
      pair: CurrencyPair,
      onOpenTicket: (pair: CurrencyPair) => void,
      theme?: RnTheme,
    ): Promise<void> {
      const { SpotTile } =
        require("#/ui/rates/SpotTile") as typeof import("#/ui/rates/SpotTile");
      await renderWithTheme(
        <SpotTile pair={pair} onOpenTicket={onOpenTicket} />,
        theme,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
