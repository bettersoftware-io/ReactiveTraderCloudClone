import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import type { ViewStyle } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { MoversBoard } from "#/ui/equities/markets/MoversBoard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

const INSTRUMENTS = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
];

const QUOTES: Record<string, QuoteFixture> = {
  AAPL: { last: 227.17, changePct: -1.06 },
  TSLA: { last: 248.67, changePct: 1.13 },
};

// The holo/dark theme's accent tokens (`renderWithTheme`'s default) —
// `useRankMoveGlide`'s tint shared value seeds at `riseColor`
// (`accentPositive`), so only a genuine "fell" classification (which needs
// the row's PREVIOUS rank remembered across the re-sort) can turn it
// `accentNegative`. A remounted row's fresh `prevRankRef` would read
// "unchanged" instead and leave the tint at its green seed — indistinguishable
// from "never moved" if the witness color were `accentPositive` instead.
const ACCENT_NEGATIVE = "#ff5d73";

test("ranks by change% under the chg sort — the mover leads", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm("chg")}>
      <MoversBoard selectedSymbol={null} onSelect={(): void => {}} />
    </ViewModelProvider>,
  );
  const labels = screen.getAllByTestId(/-rank$/);

  expect(
    labels.map((n) => {
      return n.props.children;
    }),
  ).toEqual(["01", "02"]);
  expect(screen.getByTestId("eq-mover-TSLA-rank").props.children).toBe("01");
});

test("re-sorting by symbol renumbers without remounting rows", async () => {
  const { rerender } = await renderWithTheme(
    <ViewModelProvider viewModel={vm("chg")}>
      <MoversBoard selectedSymbol={null} onSelect={(): void => {}} />
    </ViewModelProvider>,
  );
  // Under "chg", TSLA (+1.13%) leads AAPL (-1.06%): TSLA rank 01, AAPL 02.
  expect(screen.getByTestId("eq-mover-TSLA-rank").props.children).toBe("01");

  // Re-sort to "sym": AAPL (rank 01) now leads TSLA (rank 02) — TSLA's rank
  // NUMBER increases (a "fell" move), which renumbers correctly under either
  // keying scheme and so proves nothing about remounting on its own.
  //
  // Reanimated's jest mock evaluates `useAnimatedStyle` synchronously as part
  // of render, but this hook's shared-value writes happen in a `useEffect` —
  // that effect's write is invisible in the SAME render that triggered it, so
  // a second identical-tree render is needed to read it back (see
  // useRankMoveGlide.test.tsx for the same trap, spelled out in full). Two
  // SEPARATE element literals — not one reused reference — because React
  // bails out of re-invoking a function component when the new props object
  // is referentially identical to the previous one.
  await rerender(reSortedTree());
  await rerender(reSortedTree());
  expect(screen.getByTestId("eq-mover-AAPL-rank").props.children).toBe("01");

  // The actual non-remount proof: TSLA's row only correctly classifies its
  // own rank 1 → 2 move as "fell" (tinting `accentNegative`) if the SAME
  // component instance — and so its internal `useRankMoveGlide` `prevRank`
  // ref — survived the re-sort. `key={row.symbol}` (MoversBoard.tsx) is what
  // keeps it the same instance; an index key would swap TSLA and AAPL's
  // PROPS onto the position-1/position-2 slots instead of moving TSLA's own
  // slot, so TSLA's component would never see a rank change at all (its
  // slot's rank prop would flip from someone else's remount, not its own),
  // and this assertion goes red — confirmed by temporarily reverting the key
  // to `index` and re-running this file (see the fix report for that RED
  // capture; not re-broken here on purpose, since committing broken code
  // even transiently is not warranted for a one-line manual check already
  // captured in the report).
  expect(tslaGlowBackground()).toBe(ACCENT_NEGATIVE);
});

test("renders an empty state rather than a bare list", async () => {
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
  expect(screen.getByTestId("eq-movers-empty")).toBeTruthy();
});

// `vm()` doesn't stub `usePowerSaver`; each row's `useRankMoveGlide` reads it
// via `useShellMotionEnabled`. These tests assert ranking/empty-state, not
// motion behaviour, so — mirroring InstrumentHeader.test.tsx/SpotTile.test.tsx
// — the hook is stubbed directly rather than widening the ViewModel stub. A
// partial ViewModel through `ViewModelProvider` crashes with `TypeError:
// usePowerSaver is not a function` otherwise (a known trap this phase — see
// SpotTile.test.tsx/InstrumentHeader.test.tsx for the same fix).
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});

function vm(sort = "chg"): ViewModel {
  return {
    useWatchlist: () => {
      return INSTRUMENTS;
    },
    useEquityQuote: (symbol: string) => {
      return { symbol, bid: 0, ask: 0, timestamp: 0, ...QUOTES[symbol] };
    },
    // MoversRow renders its own RowSparkline (Task 3), which reads
    // useCandles(symbol) — an empty series is a legitimate "no history yet"
    // state (RowSparkline renders nothing below two closes), not a stub-out.
    useCandles: () => {
      return [];
    },
    useEqWatchlistSort: () => {
      return {
        sort,
        setSort: jest.fn(),
        cycle: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}

interface QuoteFixture {
  last: number;
  changePct: number;
}

// `rerender` (unlike `render`/`renderWithTheme`) swaps the tree at the SAME
// root verbatim — it does NOT re-apply `renderWithTheme`'s own
// `ThemeContext.Provider` wrapping, so a bare `<ViewModelProvider>` tree here
// would lose the theme `MoversBoard`/`MoversRow` read via `useTheme()`. Two
// SEPARATE calls (not one memoized element) per the "no reused reference"
// note above — each call this helper makes returns a fresh element tree.
function reSortedTree(): React.ReactElement {
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ViewModelProvider viewModel={vm("sym")}>
        <MoversBoard selectedSymbol={null} onSelect={(): void => {}} />
      </ViewModelProvider>
    </ThemeContext.Provider>
  );
}

function tslaGlowBackground(): unknown {
  // `style={[styles.rankGlow, overlayStyle]}` (MoversBoard.tsx) is an ARRAY,
  // not a flat object — `backgroundColor` lives on the second element.
  const style = screen.getByTestId("eq-mover-TSLA-glow").props
    .style as ViewStyle[];
  return style[1]?.backgroundColor;
}
