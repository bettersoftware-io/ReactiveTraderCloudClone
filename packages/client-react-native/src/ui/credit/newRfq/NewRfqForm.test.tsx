import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  type CreateRfqInput,
  type Dealer,
  Direction,
  type Instrument,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { NewRfqForm } from "#/ui/credit/newRfq/NewRfqForm";
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
  { id: 1, name: "Bank A" },
  { id: 2, name: "Bank B" },
];

test("submit is disabled until an instrument and a positive quantity are set", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(submit, { status: "editing" })}>
      <NewRfqForm onCreated={(): void => {}} />
    </ViewModelProvider>,
  );
  // No instrument / no quantity yet.
  void fireEvent.press(screen.getByTestId("rfq-submit"));
  expect(submit).not.toHaveBeenCalled();

  // Pick an instrument + a quantity.
  await fireEvent.changeText(
    screen.getByTestId("instrument-search-input"),
    "acme",
  );
  await fireEvent.press(screen.getByTestId("instrument-result-1"));
  await fireEvent.changeText(screen.getByTestId("quantity-input"), "25");
  void fireEvent.press(screen.getByTestId("rfq-submit"));

  expect(submit).toHaveBeenCalledTimes(1);
  const [input] = submit.mock.calls[0];
  expect(input).toEqual({
    instrumentId: 1,
    dealerIds: [1, 2],
    quantity: 25,
    direction: Direction.Buy,
  });
});

test("renders the confirmed card in the confirmed state", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(submit, { status: "confirmed", rfqId: 77 })}
    >
      <NewRfqForm onCreated={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("rfq-confirmed")).toHaveTextContent("RFQ ID: 77", {
    exact: false,
  });
});

type SubmitFn = (
  input: CreateRfqInput,
  onRedirect: (id: number) => void,
) => void;

type SubmissionState = ReturnType<ViewModel["useRfqSubmission"]>["state"];

function fakeViewModel(submit: SubmitFn, state: SubmissionState): ViewModel {
  return {
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return DEALERS;
    },
    useRfqSubmission: () => {
      return { state, submit };
    },
  } as unknown as ViewModel;
}
