// packages/client-react-native/tests/pages/CreditScreenPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { Quote, Rfq } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { CreditScreen } from "#/ui/credit/CreditScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// A ViewModel covering every hook the three sub-views touch, all returning
// empty collections so each renders its empty/idle state.
function fakeViewModel(): ViewModel {
  return {
    useRfqs: () => {
      return [] as readonly Rfq[];
    },
    useInstruments: () => {
      return [];
    },
    useDealers: () => {
      return [];
    },
    useAcceptQuote: () => {
      return () => {
        return Promise.resolve();
      };
    },
    useQuotesForRfq: () => {
      return [] as readonly Quote[];
    },
    useRfqCountdown: () => {
      return 0;
    },
    useRfqSubmission: () => {
      return {
        state: { status: "editing" },
        submit: () => {
          return undefined;
        },
      };
    },
    useTicketSubmission: () => {
      return {
        state: { submitted: false },
        submitPrice: () => {
          return undefined;
        },
        pass: () => {
          return undefined;
        },
      };
    },
    // The tiles cascade and countdown ring both gate on power-saver.
    usePowerSaver: () => {
      return { isFreeze: false };
    },
    useCreditRfqFilterPreference: () => {
      return { filter: "live", setFilter: () => {} };
    },
  } as unknown as ViewModel;
}

export interface CreditScreenPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  pressTab(view: "tiles" | "new-rfq" | "sell-side"): Promise<void>;
}

/** The framework surface for `CreditScreen.test.tsx`. */
export function creditScreenPage(): CreditScreenPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel()}>
          <CreditScreen />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async pressTab(view: "tiles" | "new-rfq" | "sell-side"): Promise<void> {
      await fireEvent.press(screen.getByTestId(`credit-tab-${view}`));
    },
  };
}
