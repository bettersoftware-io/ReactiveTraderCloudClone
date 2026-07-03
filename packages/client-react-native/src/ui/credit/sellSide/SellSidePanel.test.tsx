import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 1,
    name: "Acme 5.5% 2030",
    cusip: "000000AA1",
    ticker: "ACME",
    maturity: "2030",
    interestRate: 5.5,
    benchmark: "T 4.0 2030",
    refPrice: 98.4,
  },
];
const DEALERS: readonly Dealer[] = [
  { id: 9, name: ADAPTIVE_BANK_NAME },
  { id: 1, name: "Bank A" },
];

const RFQ: Rfq = {
  id: 5,
  instrumentId: 1,
  quantity: 10,
  direction: Direction.Buy,
  state: RfqState.Open,
  expirySecs: 120,
  creationTimestamp: 0,
};

test("renders a ticket for an Adaptive-Bank quote", async () => {
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel({
        rfqs: [RFQ],
        quotes: [
          {
            id: 88,
            rfqId: 5,
            dealerId: 9,
            state: { type: "pendingWithoutPrice" },
          },
        ],
      })}
    >
      <SellSidePanel />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("sell-ticket-5")).toBeTruthy();
});

test("empty state when there are no RFQs", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel({ rfqs: [], quotes: [] })}>
      <SellSidePanel />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("sell-side-empty")).toBeTruthy();
});

interface Fake {
  rfqs: readonly Rfq[];
  quotes: readonly Quote[];
}

function fakeViewModel(opts: Fake): ViewModel {
  return {
    useRfqs: () => {
      return opts.rfqs;
    },
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return DEALERS;
    },
    useQuotesForRfq: () => {
      return opts.quotes;
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
