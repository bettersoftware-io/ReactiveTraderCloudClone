// packages/client-react-native/tests/pages/NewRfqFormPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { AccessibilityState } from "react-native";

import type { CreateRfqInput, Dealer, Instrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import {
  NewRfqForm,
  type NewRfqSelection,
} from "#/ui/credit/newRfq/NewRfqForm";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { containsText } from "#tests/pages/support/textContent";

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

export type NewRfqSubmitFn = (
  input: CreateRfqInput,
  onRedirect: (id: number) => void,
) => void;

type SubmissionState = ReturnType<ViewModel["useRfqSubmission"]>["state"];

function fakeViewModel(
  submit: NewRfqSubmitFn,
  state: SubmissionState,
  dealers: readonly Dealer[],
): ViewModel {
  return {
    useInstruments: () => {
      return INSTRUMENTS;
    },
    useDealers: () => {
      return dealers;
    },
    useRfqSubmission: () => {
      return { state, submit };
    },
  } as unknown as ViewModel;
}

export interface NewRfqFormPage {
  // `dealers` is required (no default): several specs assert
  // `dealerIds`/"STREAMS TO N DEALERS" derived directly from this roster, so
  // the caller states it every time rather than relying on a page-internal
  // fixture the assertion's origin would then hide.
  mountEditing(
    submit: NewRfqSubmitFn,
    dealers: readonly Dealer[],
    initialSelection?: NewRfqSelection,
  ): Promise<void>;
  mountConfirmed(
    submit: NewRfqSubmitFn,
    dealers: readonly Dealer[],
    rfqId: number,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
  accessibilityStateOf(testId: string): AccessibilityState | undefined;
  containsTextContent(testId: string, substring: string): boolean;
}

/** The framework surface for `NewRfqForm.test.tsx`. */
export function newRfqFormPage(): NewRfqFormPage {
  return {
    async mountEditing(
      submit: NewRfqSubmitFn,
      dealers: readonly Dealer[],
      initialSelection?: NewRfqSelection,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider
          viewModel={fakeViewModel(submit, { status: "editing" }, dealers)}
        >
          <NewRfqForm
            onCreated={(): void => {}}
            initialSelection={initialSelection}
          />
        </ViewModelProvider>,
      );
    },
    async mountConfirmed(
      submit: NewRfqSubmitFn,
      dealers: readonly Dealer[],
      rfqId: number,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider
          viewModel={fakeViewModel(
            submit,
            { status: "confirmed", rfqId },
            dealers,
          )}
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
    accessibilityStateOf(testId: string): AccessibilityState | undefined {
      return screen.getByTestId(testId).props.accessibilityState as
        | AccessibilityState
        | undefined;
    },
    // Mirrors RNTL's `toHaveTextContent(text, { exact: false })`: a
    // case-insensitive substring match on the normalized text.
    containsTextContent(testId: string, substring: string): boolean {
      return containsText(screen.getByTestId(testId), substring);
    },
  };
}
