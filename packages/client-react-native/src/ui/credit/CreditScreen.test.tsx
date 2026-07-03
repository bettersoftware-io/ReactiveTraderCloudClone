import { expect, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { Quote, Rfq } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { CreditScreen } from "#/ui/credit/CreditScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("shows the RFQ tiles sub-view by default", async () => {
  await renderScreen();
  expect(screen.getByTestId("credit-tiles-panel")).toBeTruthy();
});

test("switching to New RFQ shows the create form", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("credit-tab-new-rfq"));
  expect(screen.getByTestId("new-rfq-form")).toBeTruthy();
});

test("switching to Sell Side shows the sell-side panel", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("credit-tab-sell-side"));
  expect(screen.getByTestId("sell-side-panel")).toBeTruthy();
});

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
  } as unknown as ViewModel;
}

function renderScreen(): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel()}>
      <CreditScreen />
    </ViewModelProvider>,
  );
}
