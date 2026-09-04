// packages/client-react-native/tests/pages/AcceptPulsePage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AcceptPulse } from "#/ui/credit/rfqTiles/AcceptPulse";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
  } as unknown as ViewModel;
}

export interface AcceptPulsePage {
  mount(isFreeze: boolean): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  isEmpty(): boolean;
}

/** The framework surface for `AcceptPulse.test.tsx`. */
export function acceptPulsePage(): AcceptPulsePage {
  return {
    async mount(isFreeze: boolean): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(isFreeze)}>
          <AcceptPulse />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    isEmpty(): boolean {
      return screen.toJSON() === null;
    },
  };
}
