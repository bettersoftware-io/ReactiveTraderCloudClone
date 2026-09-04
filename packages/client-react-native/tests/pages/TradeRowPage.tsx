// packages/client-react-native/tests/pages/TradeRowPage.tsx
import { screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle } from "react-native";

import type { Trade } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface TradeRowPage {
  mount(trade: Trade, isNew: boolean, time: string | undefined): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  styleOfText(text: string): TextStyle;
  /** The RAW (unflattened) `style` prop off a testID — some rows carry an
   * array-form style (`[staticStyle, { backgroundColor }]`), so the spec's
   * own `expect.arrayContaining(...)` needs the array shape, not a flattened
   * object. */
  rawStyleOf(testId: string): unknown;
}

/** The framework surface for `TradeRow.test.tsx`.
 *
 * `TradeRow` is `require()`d lazily inside `mount()` rather than imported at
 * this module's top, mirroring `BlotterModulePage`'s identical ordering
 * trap: a static top-level import here would load `TradeRow` (and its
 * `useShellMotionEnabled` import) before the spec's own `mockMotion =
 * jest.fn()` exists, since `jest.mock()` calls are hoisted above every
 * `import` but a page module's imports still run in the spec's normal import
 * order. Mirrors the base spec's own identical `require()` placement, one
 * file scope over. */
export function tradeRowPage(): TradeRowPage {
  return {
    async mount(
      trade: Trade,
      isNew: boolean,
      time: string | undefined,
    ): Promise<void> {
      const { TradeRow } =
        require("#/ui/blotter/TradeRow") as typeof import("#/ui/blotter/TradeRow");
      await renderWithTheme(
        <TradeRow trade={trade} isNew={isNew} time={time} />,
      );
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    styleOfText(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
    rawStyleOf(testId: string): unknown {
      return screen.getByTestId(testId).props.style;
    },
  };
}
