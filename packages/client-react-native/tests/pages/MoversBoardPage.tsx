// packages/client-react-native/tests/pages/MoversBoardPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import type { ViewStyle } from "react-native";

import type { EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { MoversBoard } from "#/ui/equities/markets/MoversBoard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
];

interface QuoteFixture {
  last: number;
  changePct: number;
}

const QUOTES: Record<string, QuoteFixture> = {
  AAPL: { last: 227.17, changePct: -1.06 },
  TSLA: { last: 248.67, changePct: 1.13 },
};

function vm(sort: "chg" | "sym" = "chg"): ViewModel {
  return {
    useWatchlist: () => {
      return INSTRUMENTS;
    },
    useEquityQuote: (symbol: string) => {
      return {
        symbol,
        bid: 0,
        ask: 0,
        timestamp: 0,
        ...QUOTES[symbol],
      };
    },
    // MoversRow renders its own RowSparkline, which reads useCandles(symbol)
    // — an empty series is a legitimate "no history yet" state, not a
    // stub-out.
    useCandles: () => {
      return [];
    },
    useEqWatchlistSort: () => {
      return {
        sort,
        setSort: () => {},
        cycle: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

function boardTree(sort: "chg" | "sym"): ReactElement {
  return (
    <ViewModelProvider viewModel={vm(sort)}>
      <MoversBoard selectedSymbol={null} onSelect={(): void => {}} />
    </ViewModelProvider>
  );
}

export interface MoversBoardPage {
  mount(sort?: "chg" | "sym"): Promise<void>;
  mountEmpty(): Promise<void>;
  rerenderSortedBySym(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  ranksInOrder(): unknown[];
  rankOf(symbol: string): unknown;
  glowBackgroundOf(symbol: string): unknown;
  glowCount(): number;
}

/** The framework surface for `MoversBoard.test.tsx`. Relies on the spec's
 * own `jest.mock` of `useShellMotionEnabled`, hoisted above every import in
 * the spec file. */
export function moversBoardPage(): MoversBoardPage {
  let rerender: ((el: ReactElement) => Promise<void>) | undefined;

  return {
    async mount(sort: "chg" | "sym" = "chg"): Promise<void> {
      const result = await renderWithTheme(boardTree(sort));
      rerender = result.rerender;
    },
    async mountEmpty(): Promise<void> {
      const empty = {
        ...vm(),
        useWatchlist: () => {
          return [];
        },
      } as unknown as ViewModel;
      await renderWithTheme(
        <ViewModelProvider viewModel={empty}>
          <MoversBoard selectedSymbol={null} onSelect={(): void => {}} />
        </ViewModelProvider>,
      );
    },
    // `rerender` (unlike `render`/`renderWithTheme`) swaps the tree at the
    // SAME root verbatim — it does NOT re-apply `renderWithTheme`'s own
    // `ThemeContext.Provider` wrapping. Reanimated's jest mock evaluates
    // `useAnimatedStyle` synchronously as part of render, but
    // `useRankMoveGlide`'s shared-value writes happen in a `useEffect` —
    // that effect's write is invisible in the SAME render that triggered it,
    // so a second identical-tree render is needed to read it back. Each call
    // builds a fresh element (not a reused reference) — React bails out of
    // re-invoking a function component when the new props object is
    // referentially identical to the previous one.
    async rerenderSortedBySym(): Promise<void> {
      if (!rerender) {
        throw new Error("mount() must be called before rerenderSortedBySym()");
      }

      await rerender(
        <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
          {boardTree("sym")}
        </ThemeContext.Provider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    ranksInOrder(): unknown[] {
      return screen.getAllByTestId(/-rank$/).map((n) => {
        return n.props.children;
      });
    },
    rankOf(symbol: string): unknown {
      return screen.getByTestId(`eq-mover-${symbol}-rank`).props.children;
    },
    glowBackgroundOf(symbol: string): unknown {
      // `style={[styles.rankGlow, overlayStyle]}` (MoversBoard.tsx) is an
      // ARRAY, not a flat object — `backgroundColor` lives on the second
      // element.
      const style = screen.getByTestId(`eq-mover-${symbol}-glow`).props
        .style as ViewStyle[];
      return style[1]?.backgroundColor;
    },
    glowCount(): number {
      return screen.queryAllByTestId(/-glow$/).length;
    },
  };
}
