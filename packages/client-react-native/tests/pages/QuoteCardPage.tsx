// packages/client-react-native/tests/pages/QuoteCardPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { Dealer, Quote } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { QuoteCard } from "#/ui/credit/rfqTiles/QuoteCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

const DEALER: Dealer = { id: 7, name: "Bank A" };

const VIEW_MODEL = {
  usePowerSaver: () => {
    return { isFreeze: false };
  },
} as unknown as ViewModel;

function noopAccept(): void {}

interface QuoteCardOptions {
  readonly state: Quote["state"];
  readonly isBest?: boolean;
  /** `null` means "the card is given no accept slot at all" — distinct from
   * omitting the key, which supplies a no-op one. */
  readonly acceptSlot?: ((id: number) => void) | null;
}

export interface QuoteCardPage {
  mount(options: QuoteCardOptions, theme?: RnTheme): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  press(testId: string): Promise<void>;
}

/** The framework surface for `QuoteCard.test.tsx`. */
export function quoteCardPage(): QuoteCardPage {
  return {
    async mount(
      { state, isBest = false, acceptSlot = noopAccept }: QuoteCardOptions,
      theme?: RnTheme,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={VIEW_MODEL}>
          <QuoteCard
            quote={{ id: 42, rfqId: 1, dealerId: 7, state }}
            dealer={DEALER}
            isBest={isBest}
            onAccept={acceptSlot ?? undefined}
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
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
  };
}
