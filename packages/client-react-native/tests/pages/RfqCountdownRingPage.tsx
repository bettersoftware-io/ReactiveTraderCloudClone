// packages/client-react-native/tests/pages/RfqCountdownRingPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqCountdownRing } from "#/ui/credit/rfqTiles/RfqCountdownRing";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

/** `useShellMotionEnabled` reads `usePowerSaver` off the seam, so even this
 * leaf needs a ViewModel — the theme alone is not enough. */
function fakeViewModel(isFreeze: boolean): ViewModel {
  return {
    usePowerSaver: () => {
      return { isFreeze };
    },
  } as unknown as ViewModel;
}

export interface RfqCountdownRingPage {
  mount(remainingMs: number, isFreeze?: boolean): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
}

/** The framework surface for `RfqCountdownRing.test.tsx`. */
export function rfqCountdownRingPage(): RfqCountdownRingPage {
  return {
    async mount(remainingMs: number, isFreeze = false): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(isFreeze)}>
          <RfqCountdownRing remainingMs={remainingMs} totalMs={60_000} />
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
