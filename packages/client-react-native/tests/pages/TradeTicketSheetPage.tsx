// packages/client-react-native/tests/pages/TradeTicketSheetPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { CurrencyPair } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

export interface TradeTicketSheetPage {
  mount(pair: CurrencyPair, onClose: () => void): Promise<void>;
  /** `rerender` (unlike `render`/`renderWithTheme`) swaps the tree at the
   * SAME root verbatim — it does NOT re-apply `renderWithTheme`'s own
   * `ThemeContext.Provider` wrapping, so it's reapplied explicitly here,
   * mirroring the base spec's own `withTheme(...)`-wrapped `rerender()`
   * calls (RNTL's `rerender` replaces the whole previous tree, so the theme
   * wrapper is reapplied by hand each time, same as
   * `AppearanceOverlay.test.tsx`'s `wrapped()` helper). */
  rerender(pair: CurrencyPair, onClose: () => void): Promise<void>;
  unmountAll(): Promise<void>;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `TradeTicketSheet.test.tsx`.
 *
 * `TradeTicketSheet` is `require()`d lazily via `loadComponent()` — a
 * single factory-scoped helper, called from both `mount()` and `rerender()`'s
 * `tree()` builder, rather than a separate `require()` at each call site —
 * instead of imported at this module's top. A static top-level import here
 * would resolve `TradeTicketSheet`'s own `@rtc/react-bindings`/
 * `#/ui/rates/ticket/sheetPresentation`/`useShellMotionEnabled` imports
 * before the spec's `mockExecute = jest.fn()` and friends exist, since a
 * page module's own imports still run in the spec's normal import order.
 * Mirrors the base spec's own identical `require()` placement, one file
 * scope over — jest's module registry caches the `require()`, so calling
 * `loadComponent()` more than once costs nothing. */
export function tradeTicketSheetPage(): TradeTicketSheetPage {
  function loadComponent(): typeof import("#/ui/rates/ticket/TradeTicketSheet") {
    return require("#/ui/rates/ticket/TradeTicketSheet") as typeof import("#/ui/rates/ticket/TradeTicketSheet");
  }

  function tree(pair: CurrencyPair, onClose: () => void): ReactElement {
    const { TradeTicketSheet } = loadComponent();
    return (
      <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
        <TradeTicketSheet pair={pair} onClose={onClose} />
      </ThemeContext.Provider>
    );
  }

  let rerenderFn: ((el: ReactElement) => Promise<void>) | undefined;

  return {
    async mount(pair: CurrencyPair, onClose: () => void): Promise<void> {
      const { TradeTicketSheet } = loadComponent();

      const result = await renderWithTheme(
        <TradeTicketSheet pair={pair} onClose={onClose} />,
      );
      rerenderFn = result.rerender;
    },
    async rerender(pair: CurrencyPair, onClose: () => void): Promise<void> {
      if (!rerenderFn) {
        throw new Error("mount() must be called before rerender()");
      }

      await rerenderFn(tree(pair, onClose));
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
