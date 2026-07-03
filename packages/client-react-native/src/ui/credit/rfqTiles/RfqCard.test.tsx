import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import {
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENT: Instrument = {
  id: 1,
  name: "Acme 5.5% 2030",
  cusip: "000000AA1",
  ticker: "ACME",
  maturity: "2030",
  interestRate: 5.5,
  benchmark: "T 4.0 2030",
};
const DEALERS: readonly Dealer[] = [{ id: 7, name: "Bank A" }];

test("shows instrument, direction/qty and a Live badge for an open RFQ", async () => {
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.getByText("Acme 5.5% 2030")).toBeTruthy();
  expect(screen.getByText("Buy | Qty: 25")).toBeTruthy();
  expect(screen.getByTestId("rfq-badge-3")).toHaveTextContent("Live");
});

test("renders the countdown only while open", async () => {
  await renderCard(rfq(RfqState.Open), []);
  expect(screen.getByTestId("rfq-countdown-fill")).toBeTruthy();
});

test("no countdown and a dismiss button when closed", async () => {
  await renderCard(rfq(RfqState.Closed), []);
  expect(screen.queryByTestId("rfq-countdown-fill")).toBeNull();
  expect(screen.getByTestId("rfq-dismiss-3")).toBeTruthy();
});

test("renders a quote per quote", async () => {
  const quotes: Quote[] = [
    {
      id: 42,
      rfqId: 3,
      dealerId: 7,
      state: { type: "pendingWithPrice", price: 99 },
    },
  ];
  await renderCard(rfq(RfqState.Open), quotes);
  expect(screen.getByTestId("quote-accept-42")).toBeTruthy();
});

function rfq(state: RfqState): Rfq {
  return {
    id: 3,
    instrumentId: 1,
    quantity: 25,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function fakeViewModel(remainingMs: number): ViewModel {
  return {
    useRfqCountdown: () => {
      return remainingMs;
    },
  } as unknown as ViewModel;
}

function renderCard(rfqValue: Rfq, quotes: readonly Quote[]): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(60_000)}>
      <RfqCard
        rfq={rfqValue}
        quotes={quotes}
        instrument={INSTRUMENT}
        dealers={DEALERS}
        onAccept={() => {
          return undefined;
        }}
        onDismiss={() => {
          return undefined;
        }}
      />
    </ViewModelProvider>,
  );
}
