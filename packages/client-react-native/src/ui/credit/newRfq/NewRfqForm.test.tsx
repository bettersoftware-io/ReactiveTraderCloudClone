import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import {
  type CreateRfqInput,
  type Dealer,
  Direction,
  type Instrument,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import {
  NewRfqForm,
  type NewRfqSelection,
} from "#/ui/credit/newRfq/NewRfqForm";
import { RFQ_QUANTITY_CHIPS } from "#/ui/credit/newRfq/rfqQuantities";
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

test("broadcast is inert until an instrument and a quantity chip are chosen", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderEditingForm(submit);

  // No instrument / no quantity yet.
  void fireEvent.press(screen.getByTestId("rfq-submit"));
  expect(submit).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByTestId("instrument-chip-1"));
  void fireEvent.press(screen.getByTestId("rfq-submit"));
  expect(submit).not.toHaveBeenCalled();

  await fireEvent.press(
    screen.getByTestId(`quantity-chip-${RFQ_QUANTITY_CHIPS[2]}`),
  );
  void fireEvent.press(screen.getByTestId("rfq-submit"));

  expect(submit).toHaveBeenCalledTimes(1);
  const [input] = submit.mock.calls[0];
  expect(input).toEqual({
    instrumentId: 1,
    dealerIds: [1, 2],
    // UI-SCALE, not notional: `CreateRfqUseCase` multiplies by
    // CREDIT_QUANTITY_MULTIPLIER on the way to the port. Asserting the literal
    // notional here is what let a 1000x error reach a device.
    quantity: RFQ_QUANTITY_CHIPS[2],
    direction: Direction.Buy,
  });
});

// The dealer picker is gone (Phase 5 design §5a) — every RFQ streams to the
// whole panel. This is the assertion that would catch an empty `dealerIds`
// slipping through, which the seam would reject.
test("broadcasts to every dealer with no picker in the form", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderEditingForm(submit);

  await fireEvent.press(screen.getByTestId("instrument-chip-1"));
  await fireEvent.press(
    screen.getByTestId(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`),
  );
  void fireEvent.press(screen.getByTestId("rfq-submit"));

  expect(submit.mock.calls[0][0].dealerIds).toEqual([1, 2]);
  expect(screen.getByText("STREAMS TO 2 DEALERS · 45S WINDOW")).toBeTruthy();
});

test("sell direction rides through to the submitted rfq", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderEditingForm(submit);

  await fireEvent.press(screen.getByTestId("instrument-chip-1"));
  await fireEvent.press(
    screen.getByTestId(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`),
  );
  await fireEvent.press(screen.getByTestId(`rfq-direction-${Direction.Sell}`));
  void fireEvent.press(screen.getByTestId("rfq-submit"));

  expect(submit.mock.calls[0][0].direction).toBe(Direction.Sell);
});

// The visual harness cannot tap before it screenshots, so the golden's
// pre-chosen ticket has to arrive as a prop. These two assertions pin both
// halves of that seam: the seeded chips read selected, and the seeded values
// are what actually submit (a seed that only painted the chips would be a
// lie the golden could not see).
test("initialSelection preselects the instrument, direction and quantity chips", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderEditingForm(submit, {
    instrumentId: 1,
    direction: Direction.Sell,
    quantity: RFQ_QUANTITY_CHIPS[2],
  });

  expect(
    screen.getByTestId("instrument-chip-1").props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(
    screen.getByTestId(`quantity-chip-${RFQ_QUANTITY_CHIPS[2]}`).props
      .accessibilityState,
  ).toMatchObject({ selected: true });

  void fireEvent.press(screen.getByTestId("rfq-submit"));

  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0][0]).toEqual({
    instrumentId: 1,
    dealerIds: [1, 2],
    quantity: RFQ_QUANTITY_CHIPS[2],
    direction: Direction.Sell,
  });
});

// An omitted field must fall back to the form's own default rather than
// blanking the other two — the fields are independent.
test("an omitted initialSelection field keeps the form default", async () => {
  const submit = jest.fn<SubmitFn>();
  await renderEditingForm(submit, { instrumentId: 1 });

  expect(
    screen.getByTestId("instrument-chip-1").props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(
    screen.getByTestId(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`).props
      .accessibilityState,
  ).toMatchObject({ selected: false });

  // No quantity yet, so broadcast is still inert.
  void fireEvent.press(screen.getByTestId("rfq-submit"));
  expect(submit).not.toHaveBeenCalled();

  await fireEvent.press(
    screen.getByTestId(`quantity-chip-${RFQ_QUANTITY_CHIPS[0]}`),
  );
  void fireEvent.press(screen.getByTestId("rfq-submit"));

  expect(submit.mock.calls[0][0].direction).toBe(Direction.Buy);
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

function renderEditingForm(
  submit: SubmitFn,
  initialSelection?: NewRfqSelection,
): Promise<unknown> {
  return renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(submit, { status: "editing" })}>
      <NewRfqForm
        onCreated={(): void => {}}
        initialSelection={initialSelection}
      />
    </ViewModelProvider>,
  );
}

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
