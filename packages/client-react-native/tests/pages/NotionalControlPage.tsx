// packages/client-react-native/tests/pages/NotionalControlPage.tsx
import { fireEvent, screen } from "@testing-library/react-native";

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
  press(testId: string): Promise<void>;
  pressText(text: string): Promise<void>;
  /** The RAW (unflattened) `style` prop off the text node's PARENT — the
   * base spec's own `screen.getByText(text).parent?.props.style`. */
  rawParentStyleOfText(text: string): unknown;
  /** The RAW (unflattened) `style` prop off the text node itself — the base
   * spec's own `screen.getByText(text).props.style`. */
  rawStyleOfText(text: string): unknown;
}

/** The framework surface for `NotionalControl.test.tsx`. */
export function notionalControlPage(): NotionalControlPage {
  return {
    async mount(notional: FakeNotional, base: string): Promise<void> {
      await renderWithTheme(
        <NotionalControl notional={notional} base={base} />,
      );
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    async pressText(text: string): Promise<void> {
      await fireEvent.press(screen.getByText(text));
    },
    rawParentStyleOfText(text: string): unknown {
      return screen.getByText(text).parent?.props.style;
    },
    rawStyleOfText(text: string): unknown {
      return screen.getByText(text).props.style;
    },
  };
}
