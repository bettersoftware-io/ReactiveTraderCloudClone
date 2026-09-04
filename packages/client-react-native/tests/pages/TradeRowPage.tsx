// packages/client-react-native/tests/pages/TradeRowPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import {
  type StyleProp,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import type { Trade } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface TradeRowPage {
  mount(trade: Trade, isNew: boolean, time: string | undefined): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  styleOfText(text: string): TextStyle;
  /** The RAW (unflattened) `color` off a text node's `style` — the base
   * spec's own `props.style.color` reads, un-flattened, on the two status
   * accent-colour sites. A flattened return would pass even if the status
   * text's style became an array (a real regression `toHaveStyle`-style
   * assertions are meant to catch), so this deliberately does NOT go through
   * `styleOfText`. Mirrors `PairPnlBarsPage.labelColorOf`'s identical
   * shape, one directory over. */
  textColorOf(text: string): TextStyle["color"];
  /** The RAW (unflattened) `style` prop off a testID — some rows carry an
   * array-form style (`[staticStyle, { backgroundColor }]`), so the spec's
   * own `expect.arrayContaining(...)` needs the array shape, not a flattened
   * object. */
  rawStyleOf(testId: string): StyleProp<ViewStyle>;
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
    async unmountAll(): Promise<void> {
      await cleanup();
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
    textColorOf(text: string): TextStyle["color"] {
      const style = screen.getByText(text).props.style as TextStyle;
      return style.color;
    },
    rawStyleOf(testId: string): StyleProp<ViewStyle> {
      return screen.getByTestId(testId).props.style as StyleProp<ViewStyle>;
    },
  };
}
