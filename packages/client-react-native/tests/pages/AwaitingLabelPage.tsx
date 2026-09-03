// packages/client-react-native/tests/pages/AwaitingLabelPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AwaitingLabel } from "#/ui/credit/rfqTiles/AwaitingLabel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
  } as unknown as ViewModel;
}

export interface AwaitingLabelPage {
  mount(isFreeze: boolean): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
}

/** The framework surface for `AwaitingLabel.test.tsx`. */
export function awaitingLabelPage(): AwaitingLabelPage {
  return {
    async mount(isFreeze: boolean): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(isFreeze)}>
          <AwaitingLabel />
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
