import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityPosition } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const POSITIONS: readonly EquityPosition[] = [
  {
    symbol: "AAPL",
    qty: 1200,
    avgPrice: 118.4,
    markPrice: 131.2,
    unrealisedPnl: 15_440,
  },
  {
    symbol: "JPM",
    qty: -300,
    avgPrice: 252,
    markPrice: 255.08,
    unrealisedPnl: -924,
  },
];

test("renders a card per position with signed qty, @avg and compact P&L", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(POSITIONS)}>
      <PositionsBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("positions-panel")).toBeTruthy();
  expect(screen.getByTestId("position-row-AAPL")).toBeTruthy();
  expect(screen.getByText("+1,200")).toBeTruthy();
  expect(screen.getByText("@118.40")).toBeTruthy();
  expect(screen.getByTestId("eq-position-pnl-AAPL")).toHaveTextContent(
    "+15.4K",
  );
  expect(screen.getByText("−300")).toBeTruthy();
  expect(screen.getByTestId("eq-position-pnl-JPM")).toHaveTextContent("−924");
});

test("colours quantity and P&L by sign", async () => {
  const t = rnThemeTokens.holo.dark;
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(POSITIONS)}>
      <PositionsBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByText("+1,200")).toHaveStyle({ color: t.accentPositive });
  expect(screen.getByText("−300")).toHaveStyle({ color: t.accentNegative });
  expect(screen.getByTestId("eq-position-pnl-AAPL")).toHaveStyle({
    color: t.accentPositive,
  });
  expect(screen.getByTestId("eq-position-pnl-JPM")).toHaveStyle({
    color: t.accentNegative,
  });
});

test("shows an empty state with no positions", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith([])}>
      <PositionsBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("positions-empty")).toBeTruthy();
  expect(screen.queryByTestId("positions-panel")).toBeNull();
});

function vmWith(positions: readonly EquityPosition[]): ViewModel {
  return {
    useEquityPositions: () => {
      return positions;
    },
  } as unknown as ViewModel;
}
