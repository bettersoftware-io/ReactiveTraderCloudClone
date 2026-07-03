import { expect, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
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
const DEALERS: readonly Dealer[] = [{ id: 7, name: "Bank A" }];

test("defaults to the Live filter and lists open RFQs", async () => {
  await renderPanel({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  expect(screen.getByTestId("rfq-card-1")).toBeTruthy();
  expect(screen.queryByTestId("rfq-card-2")).toBeNull();
});

test("switching to All reveals closed RFQs", async () => {
  await renderPanel({ rfqs: [rfq(1, RfqState.Open), rfq(2, RfqState.Closed)] });
  await fireEvent.press(screen.getByTestId("rfq-filter-All"));
  expect(screen.getByTestId("rfq-card-2")).toBeTruthy();
});

test("empty state when no RFQs match", async () => {
  await renderPanel({ rfqs: [rfq(2, RfqState.Closed)] });
  expect(screen.getByTestId("credit-tiles-empty")).toBeTruthy();
});

test("dismissing a closed RFQ removes it from the list", async () => {
  await renderPanel({ rfqs: [rfq(2, RfqState.Closed)] });
  await fireEvent.press(screen.getByTestId("rfq-filter-All"));
  expect(screen.getByTestId("rfq-card-2")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("rfq-dismiss-2"));
  expect(screen.queryByTestId("rfq-card-2")).toBeNull();
});

function rfq(id: number, state: RfqState): Rfq {
  return {
    id,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: id,
  };
}

interface FakeOpts {
  rfqs: readonly Rfq[];
  accept?: (id: number) => Promise<void>;
}

function fakeViewModel(opts: FakeOpts): ViewModel {
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
    useAcceptQuote: () => {
      return (
        opts.accept ??
        (() => {
          return Promise.resolve();
        })
      );
    },
    useQuotesForRfq: () => {
      return [] as readonly Quote[];
    },
    useRfqCountdown: () => {
      return 60_000;
    },
  } as unknown as ViewModel;
}

function renderPanel(opts: FakeOpts): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(opts)}>
      <RfqTilesPanel />
    </ViewModelProvider>,
  );
}
