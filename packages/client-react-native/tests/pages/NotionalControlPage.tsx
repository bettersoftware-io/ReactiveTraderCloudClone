// packages/client-react-native/tests/pages/NotionalControlPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { NotionalControl } from "#/ui/rates/ticket/NotionalControl";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

interface NotionalState {
  displayValue: string;
  numericValue: number;
  error: string | null;
}

interface FakeNotional {
  state: NotionalState;
  change: (value: string) => void;
  reset: () => void;
}

export interface NotionalControlPage {
  mount(notional: FakeNotional, base: string): Promise<void>;
  unmountAll(): Promise<void>;
  press(testId: string): Promise<void>;
  pressText(text: string): Promise<void>;
  /** The RAW (unflattened) `style` prop off the text node's PARENT — the
   * base spec's own `screen.getByText(text).parent?.props.style`. */
  rawParentStyleOfText(text: string): StyleProp<ViewStyle>;
  /** The RAW (unflattened) `style` prop off the text node itself — the base
   * spec's own `screen.getByText(text).props.style`. */
  rawStyleOfText(text: string): StyleProp<ViewStyle>;
}

/** The framework surface for `NotionalControl.test.tsx`. */
export function notionalControlPage(): NotionalControlPage {
  return {
    async mount(notional: FakeNotional, base: string): Promise<void> {
      await renderWithTheme(
        <NotionalControl notional={notional} base={base} />,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    async pressText(text: string): Promise<void> {
      await fireEvent.press(screen.getByText(text));
    },
    rawParentStyleOfText(text: string): StyleProp<ViewStyle> {
      return screen.getByText(text).parent?.props.style as StyleProp<ViewStyle>;
    },
    rawStyleOfText(text: string): StyleProp<ViewStyle> {
      return screen.getByText(text).props.style as StyleProp<ViewStyle>;
    },
  };
}
