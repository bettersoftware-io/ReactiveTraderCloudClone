// packages/client-react-native/tests/pages/PriceStepperPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import { PriceStepper } from "#/ui/credit/sellSide/PriceStepper";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface PriceStepperPage {
  mount(value: number, onChange: (next: number) => void): Promise<void>;
  unmountAll(): Promise<void>;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `PriceStepper.test.tsx`. */
export function priceStepperPage(): PriceStepperPage {
  return {
    async mount(
      value: number,
      onChange: (next: number) => void,
    ): Promise<void> {
      await renderWithTheme(<PriceStepper value={value} onChange={onChange} />);
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
