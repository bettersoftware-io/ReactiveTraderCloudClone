// packages/client-react-native/tests/pages/RowSparklinePage.tsx
import { jest } from "@jest/globals";
import { Skia } from "@shopify/react-native-skia";
import { cleanup, screen } from "@testing-library/react-native";

import type { EquityQuote } from "@rtc/domain";

import { RowSparkline } from "#/ui/equities/markets/RowSparkline";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface RowSparklinePage {
  mount(symbol: string, prices: readonly number[]): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  /** The SVG path string handed to Skia on the most recent render. */
  drawnSvgPath(): string | undefined;
}

/** The framework surface for `RowSparkline.test.tsx`. */
export function rowSparklinePage(): RowSparklinePage {
  // Skia is fully mocked in jest and the mock discards the SVG string, so the
  // only observable "what was drawn" is the argument to MakeFromSVGString.
  const makeFromSvg = jest.spyOn(Skia.Path, "MakeFromSVGString");

  return {
    async mount(symbol: string, prices: readonly number[]): Promise<void> {
      await renderWithTheme(
        <RowSparkline
          symbol={symbol}
          positive
          history={createQuotes(symbol, prices)}
        />,
      );
    },
    drawnSvgPath(): string | undefined {
      return makeFromSvg.mock.calls.at(-1)?.[0];
    },
    async unmountAll(): Promise<void> {
      await cleanup();
      makeFromSvg.mockClear();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}

function createQuotes(
  symbol: string,
  prices: readonly number[],
): readonly EquityQuote[] {
  return prices.map((price, i) => {
    return {
      symbol,
      // Deliberately NOT affine in `price`: the sparkline min-max normalises,
      // so a shifted/scaled bid or ask would draw the same path and hide a
      // `quote.last` -> `quote.bid` mutation.
      bid: 100 - price,
      ask: price * price,
      last: price,
      changePct: 0,
      timestamp: i,
    };
  });
}
