// packages/client-react-native/tests/pages/RfqCardPage.tsx
import { cleanup, screen } from "@testing-library/react-native";

import type { Dealer, Instrument, Quote, Rfq } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";
import { normalizeText, textContentOf } from "#tests/pages/support/textContent";

const INSTRUMENT: Instrument = {
  id: 1,
  name: "Acme 5.5% 2030",
  cusip: "000000AA1",
  ticker: "ACME",
  maturity: "2030",
  interestRate: 5.5,
  benchmark: "T 4.0 2030",
  refPrice: 98.4,
};
const DEALERS: readonly Dealer[] = [{ id: 7, name: "Bank A" }];

function fakeViewModel(remainingMs: number): ViewModel {
  return {
    useRfqCountdown: () => {
      return remainingMs;
    },
    // The ring's motion gate reads power-saver off the same seam.
    usePowerSaver: () => {
      return { isFreeze: false };
    },
  } as unknown as ViewModel;
}

export interface RfqCardPage {
  mount(rfq: Rfq, quotes: readonly Quote[], theme?: RnTheme): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
}

/** The framework surface for `RfqCard.test.tsx`. */
export function rfqCardPage(): RfqCardPage {
  return {
    async mount(
      rfq: Rfq,
      quotes: readonly Quote[],
      theme?: RnTheme,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(60_000)}>
          <RfqCard
            rfq={rfq}
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
        theme,
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
    hasTextContent(testId: string, text: string): boolean {
      return (
        normalizeText(textContentOf(screen.getByTestId(testId))) ===
        normalizeText(text)
      );
    },
  };
}
