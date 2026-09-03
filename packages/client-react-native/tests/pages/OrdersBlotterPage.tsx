// packages/client-react-native/tests/pages/OrdersBlotterPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import type { TextStyle } from "react-native";
import { StyleSheet } from "react-native";

import type { EquityOrder } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrdersBlotter } from "#/ui/equities/blotters/OrdersBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { normalizeText, textContentOf } from "#tests/pages/support/textContent";

function vmWith(orders: readonly EquityOrder[]): ViewModel {
  return {
    useEquityOrders: () => {
      return orders;
    },
  } as unknown as ViewModel;
}

export interface OrdersBlotterPage {
  mount(orders: readonly EquityOrder[]): Promise<void>;
  rerenderWith(orders: readonly EquityOrder[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
  styleOf(testId: string): TextStyle;
  selected(orderId: string): boolean;
}

/** The framework surface for `OrdersBlotter.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function ordersBlotterPage(): OrdersBlotterPage {
  let rerender: ((el: ReactElement) => Promise<void>) | undefined;

  return {
    async mount(orders: readonly EquityOrder[]): Promise<void> {
      const result = await renderWithTheme(
        <ViewModelProvider viewModel={vmWith(orders)}>
          <OrdersBlotter />
        </ViewModelProvider>,
      );
      rerender = result.rerender;
    },
    // `rerender` (unlike `render`/`renderWithTheme`) swaps the tree at the
    // SAME root verbatim — it does NOT re-apply `renderWithTheme`'s own
    // `ThemeContext.Provider` wrapping, so it's reapplied explicitly here
    // (see MoversBoard.test.tsx for the same note).
    async rerenderWith(orders: readonly EquityOrder[]): Promise<void> {
      if (!rerender) {
        throw new Error("mount() must be called before rerenderWith()");
      }

      await rerender(
        <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
          <ViewModelProvider viewModel={vmWith(orders)}>
            <OrdersBlotter />
          </ViewModelProvider>
        </ThemeContext.Provider>,
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
    hasTextContent(testId: string, text: string): boolean {
      return (
        normalizeText(textContentOf(screen.getByTestId(testId))) ===
        normalizeText(text)
      );
    },
    styleOf(testId: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByTestId(testId).props.style as TextStyle,
      );
    },
    selected(orderId: string): boolean {
      const state = screen.getByTestId(`order-row-${orderId}`).props
        .accessibilityState as { selected?: boolean } | undefined;
      return state?.selected === true;
    },
  };
}
