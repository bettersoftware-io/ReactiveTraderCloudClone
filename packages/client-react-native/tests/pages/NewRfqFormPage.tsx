// packages/client-react-native/tests/pages/NewRfqFormPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { CreateRfqInput, Dealer, Instrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import {
  NewRfqForm,
  type NewRfqSelection,
} from "#/ui/credit/newRfq/NewRfqForm";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { normalizeText, textContentOf } from "#tests/pages/support/textContent";

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

export type NewRfqSubmitFn = (
  input: CreateRfqInput,
  onRedirect: (id: number) => void,
) => void;

type SubmissionState = ReturnType<ViewModel["useRfqSubmission"]>["state"];

function fakeViewModel(
  submit: NewRfqSubmitFn,
  state: SubmissionState,
): ViewModel {
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

export interface NewRfqFormPage {
  mountEditing(
    submit: NewRfqSubmitFn,
    initialSelection?: NewRfqSelection,
  ): Promise<void>;
  mountConfirmed(submit: NewRfqSubmitFn, rfqId: number): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
  accessibilityStateOf(testId: string): unknown;
  containsTextContent(testId: string, substring: string): boolean;
}

/** The framework surface for `NewRfqForm.test.tsx`. */
export function newRfqFormPage(): NewRfqFormPage {
  return {
    async mountEditing(
      submit: NewRfqSubmitFn,
      initialSelection?: NewRfqSelection,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider
          viewModel={fakeViewModel(submit, { status: "editing" })}
        >
          <NewRfqForm
            onCreated={(): void => {}}
            initialSelection={initialSelection}
          />
        </ViewModelProvider>,
      );
    },
    async mountConfirmed(submit: NewRfqSubmitFn, rfqId: number): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider
          viewModel={fakeViewModel(submit, { status: "confirmed", rfqId })}
        >
          <NewRfqForm onCreated={(): void => {}} />
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
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    accessibilityStateOf(testId: string): unknown {
      return screen.getByTestId(testId).props.accessibilityState;
    },
    // Mirrors RNTL's `toHaveTextContent(text, { exact: false })`: a
    // case-insensitive substring match on the normalized text.
    containsTextContent(testId: string, substring: string): boolean {
      return normalizeText(textContentOf(screen.getByTestId(testId)))
        .toLowerCase()
        .includes(normalizeText(substring).toLowerCase());
    },
  };
}
