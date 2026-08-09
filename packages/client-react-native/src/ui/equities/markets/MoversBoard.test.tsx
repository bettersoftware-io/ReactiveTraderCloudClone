import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { MoversBoard } from "#/ui/equities/markets/MoversBoard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const INSTRUMENTS = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
];

const QUOTES: Record<string, QuoteFixture> = {
  AAPL: { last: 227.17, changePct: -1.06 },
  TSLA: { last: 248.67, changePct: 1.13 },
};

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
  await renderWithTheme(
    <ViewModelProvider viewModel={vm("sym")}>
      <MoversBoard selectedSymbol={null} onSelect={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-mover-AAPL-rank").props.children).toBe("01");
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
