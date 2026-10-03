// packages/client-react-native/tests/pages/RfqCardPage.tsx
import {
  cleanup,
  type RenderResult,
  screen,
} from "@testing-library/react-native";
import type { JSX } from "react";

import type { Dealer, Instrument, Quote, Rfq } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { type RnTheme, rnThemeTokens } from "#/ui/theme/tokens";
import { matchesTextExactly } from "#tests/pages/support/textContent";

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

// One instance for the page's lifetime: `update` must hand the provider the
// SAME view model, or the re-render would be a remount in disguise.
const VIEW_MODEL = {
  useRfqCountdown: () => {
    return 60_000;
  },
  // The ring's motion gate reads power-saver off the same seam.
  usePowerSaver: () => {
    return { isFreeze: false };
  },
} as unknown as ViewModel;

export interface RfqCardPage {
  mount(rfq: Rfq, quotes: readonly Quote[], theme?: RnTheme): Promise<void>;
  /** Re-renders the mounted card with a new RFQ — a state transition, as
   * opposed to `mount`, which is a card arriving already in that state. */
  update(rfq: Rfq, quotes: readonly Quote[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextContent(testId: string, text: string): boolean;
}

/** The framework surface for `RfqCard.test.tsx`. */
export function rfqCardPage(): RfqCardPage {
  let rendered: RenderResult | null = null;
  let mountedTheme: RnTheme = rnThemeTokens.holo.dark;

  return {
    async mount(
      rfq: Rfq,
      quotes: readonly Quote[],
      theme: RnTheme = rnThemeTokens.holo.dark,
    ): Promise<void> {
      mountedTheme = theme;
      rendered = await renderWithTheme(createCard(rfq, quotes), theme);
    },
    async update(rfq: Rfq, quotes: readonly Quote[]): Promise<void> {
      if (rendered == null) {
        throw new Error("update() before mount()");
      }

      await rendered.rerender(
        <ThemeContext.Provider value={mountedTheme}>
          {createCard(rfq, quotes)}
        </ThemeContext.Provider>,
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
      return matchesTextExactly(screen.getByTestId(testId), text);
    },
  };
}

function createCard(rfq: Rfq, quotes: readonly Quote[]): JSX.Element {
  return (
    <ViewModelProvider viewModel={VIEW_MODEL}>
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
    </ViewModelProvider>
  );
}
