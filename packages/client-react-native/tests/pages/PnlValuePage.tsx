// packages/client-react-native/tests/pages/PnlValuePage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import { PnlValue } from "#/ui/analytics/PnlValue";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { matchesTextExactly } from "#tests/pages/support/textContent";

export interface PnlValuePage {
  mount(value: number): Promise<void>;
  unmountAll(): Promise<void>;
  hasTextContent(testId: string, text: string): boolean;
}

/** The framework surface for `PnlValue.test.tsx`. */
export function pnlValuePage(): PnlValuePage {
  return {
    async mount(value: number): Promise<void> {
      await renderWithTheme(<PnlValue value={value} />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    hasTextContent(testId: string, text: string): boolean {
      return matchesTextExactly(screen.getByTestId(testId), text);
    },
  };
}
