// packages/client-react-native/tests/pages/SellSidePanelPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { matchesTextExactly } from "#tests/pages/support/textContent";

export const ADAPTIVE_BANK_ID = 9;

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
  { id: ADAPTIVE_BANK_ID, name: ADAPTIVE_BANK_NAME },
  { id: 1, name: "Bank A" },
];

function noopSubmit(): void {}

function noopPass(): void {}

interface SellSidePanelFixture {
  rfqs: readonly Rfq[];
  quoteFor: (rfqId: number) => Quote | undefined;
  submitPrice?: (quoteId: number, price: number) => void;
}

export interface SellSidePanelPage {
  mount(opts: SellSidePanelFixture): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  matchingCount(pattern: RegExp): number;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  press(testId: string): Promise<void>;
  hasTextContent(testId: string, text: string): boolean;
}

/** The framework surface for `SellSidePanel.test.tsx`. */
export function sellSidePanelPage(): SellSidePanelPage {
  return {
    async mount(opts: SellSidePanelFixture): Promise<void> {
      const viewModel = {
        useRfqs: () => {
          return opts.rfqs;
        },
        useInstruments: () => {
          return INSTRUMENTS;
        },
        useDealers: () => {
          return DEALERS;
        },
        useQuotesForRfq: (rfqId: number) => {
          const quote = opts.quoteFor(rfqId);
          return quote ? [quote] : [];
        },
        useRfqCountdown: () => {
          return 60_000;
        },
        useTicketSubmission: () => {
          return {
            state: { submitted: false },
            submitPrice: opts.submitPrice ?? noopSubmit,
            pass: noopPass,
          };
        },
      } as unknown as ViewModel;

      await renderWithTheme(
        <ViewModelProvider viewModel={viewModel}>
          <SellSidePanel />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    matchingCount(pattern: RegExp): number {
      return screen.queryAllByTestId(pattern).length;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    hasTextContent(testId: string, text: string): boolean {
      return matchesTextExactly(screen.getByTestId(testId), text);
    },
  };
}
