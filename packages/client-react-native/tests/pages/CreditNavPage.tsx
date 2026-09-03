// packages/client-react-native/tests/pages/CreditNavPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import { CreditNav, type CreditView } from "#/ui/credit/CreditNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { normalizeText, textContentOf } from "#tests/pages/support/textContent";

export interface CreditNavPage {
  mount(view: CreditView, onChange: (view: CreditView) => void): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
  pressTab(view: CreditView): Promise<void>;
}

/** The framework surface for `CreditNav.test.tsx`. */
export function creditNavPage(): CreditNavPage {
  return {
    async mount(
      view: CreditView,
      onChange: (view: CreditView) => void,
    ): Promise<void> {
      await renderWithTheme(<CreditNav view={view} onChange={onChange} />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasTextContent(testId: string, text: string): boolean {
      return (
        normalizeText(textContentOf(screen.getByTestId(testId))) ===
        normalizeText(text)
      );
    },
    async pressTab(view: CreditView): Promise<void> {
      await fireEvent.press(screen.getByTestId(`credit-tab-${view}`));
    },
  };
}
