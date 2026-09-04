// packages/client-react-native/tests/pages/EquitiesNavPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import { EquitiesNav, type EquitiesView } from "#/ui/equities/EquitiesNav";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { matchesTextExactly } from "#tests/pages/support/textContent";

export interface EquitiesNavPage {
  mount(
    view: EquitiesView,
    onChange: (view: EquitiesView) => void,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
  pressTab(view: EquitiesView): Promise<void>;
}

/** The framework surface for `EquitiesNav.test.tsx`. */
export function equitiesNavPage(): EquitiesNavPage {
  return {
    async mount(
      view: EquitiesView,
      onChange: (view: EquitiesView) => void,
    ): Promise<void> {
      await renderWithTheme(<EquitiesNav view={view} onChange={onChange} />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasTextContent(testId: string, text: string): boolean {
      return matchesTextExactly(screen.getByTestId(testId), text);
    },
    async pressTab(view: EquitiesView): Promise<void> {
      await fireEvent.press(screen.getByTestId(`equities-tab-${view}`));
    },
  };
}
