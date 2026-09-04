// packages/client-react-native/tests/pages/ExposureBubblesPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { StyleProp, ViewStyle } from "react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import { ExposureBubbles } from "#/ui/analytics/ExposureBubbles";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface ExposureBubblesPage {
  mount(positions: readonly CurrencyPairPosition[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  /** The RAW (array-form) `style` prop off a testID — the base spec's own
   * `toContainEqual(expect.objectContaining({ height }))`, which needs the
   * array shape rather than a flattened object. */
  rawStyleOf(testId: string): StyleProp<ViewStyle>;
}

/**
 * The framework surface for `ExposureBubbles.test.tsx`. These tests prove the
 * canvas MOUNTS and survives every book shape — Skia elements take no
 * `testID`, so there is nothing to query about individual bubbles. Which
 * currencies appear, how big, which accent and which labels they carry are
 * decided in `buildBubbleDrawModel` and asserted in its own test.
 */
export function exposureBubblesPage(): ExposureBubblesPage {
  return {
    async mount(positions: readonly CurrencyPairPosition[]): Promise<void> {
      await renderWithTheme(<ExposureBubbles positions={positions} />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    rawStyleOf(testId: string): StyleProp<ViewStyle> {
      return screen.getByTestId(testId).props.style as StyleProp<ViewStyle>;
    },
  };
}
