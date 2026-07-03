import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { TradeTicket } from "#/ui/credit/sellSide/TradeTicket";
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

test("submitting a valid price calls submitPrice with the quote id", async () => {
  const submitPrice = jest.fn<(q: number, p: number) => void>();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel({
        submitPrice,
        pass: () => {
          return undefined;
        },
      })}
    >
      <TradeTicket
        rfq={rfq(RfqState.Open)}
        quote={quote({ type: "pendingWithoutPrice" })}
        instrument={INSTRUMENT}
      />
    </ViewModelProvider>,
  );
  await fireEvent.changeText(
    screen.getByTestId("sell-ticket-price-5"),
    "101.5",
  );
  void fireEvent.press(screen.getByTestId("sell-ticket-submit-5"));
  expect(submitPrice).toHaveBeenCalledWith(88, 101.5);
});

test("Pass calls pass with the quote id", async () => {
  const pass = jest.fn<(q: number) => void>();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel({
        submitPrice: () => {
          return undefined;
        },
        pass,
      })}
    >
      <TradeTicket
        rfq={rfq(RfqState.Open)}
        quote={quote({ type: "pendingWithoutPrice" })}
        instrument={INSTRUMENT}
      />
    </ViewModelProvider>,
  );
  void fireEvent.press(screen.getByTestId("sell-ticket-pass-5"));
  expect(pass).toHaveBeenCalledWith(88);
});

test("shows the quoted price once responded", async () => {
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel({
        submitPrice: () => {
          return undefined;
        },
        pass: () => {
          return undefined;
        },
      })}
    >
      <TradeTicket
        rfq={rfq(RfqState.Open)}
        quote={quote({ type: "pendingWithPrice", price: 101 })}
        instrument={INSTRUMENT}
      />
    </ViewModelProvider>,
  );
  expect(screen.getByText("Quoted: $101")).toBeTruthy();
  expect(screen.queryByTestId("sell-ticket-submit-5")).toBeNull();
});

function rfq(state: RfqState): Rfq {
  return {
    id: 5,
    instrumentId: 1,
    quantity: 10,
    direction: Direction.Buy,
    state,
    expirySecs: 120,
    creationTimestamp: 0,
  };
}

function quote(state: Quote["state"]): Quote {
  return { id: 88, rfqId: 5, dealerId: 9, state };
}

interface TicketFake {
  submitPrice: (quoteId: number, price: number) => void;
  pass: (quoteId: number) => void;
  submitted?: boolean;
}

function fakeViewModel(opts: TicketFake): ViewModel {
  return {
    useTicketSubmission: () => {
      return {
        state: { submitted: opts.submitted ?? false },
        submitPrice: opts.submitPrice,
        pass: opts.pass,
      };
    },
  } as unknown as ViewModel;
}
