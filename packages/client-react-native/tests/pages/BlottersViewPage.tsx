// packages/client-react-native/tests/pages/BlottersViewPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { BlottersView } from "#/ui/equities/blotters/BlottersView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function vm(): ViewModel {
  return {
    useEquityOrders: () => {
      return [];
    },
    useEquityPositions: () => {
      return [];
    },
  } as unknown as ViewModel;
}

export interface BlottersViewPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
}

/** The framework surface for `BlottersView.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function blottersViewPage(): BlottersViewPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vm()}>
          <BlottersView />
        </ViewModelProvider>,
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
  };
}
