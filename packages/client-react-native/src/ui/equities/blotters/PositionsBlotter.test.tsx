import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { EquityPosition } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { PositionsBlotter } from "#/ui/equities/blotters/PositionsBlotter";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the desk gauge plus a row per position", async () => {
  const positions: readonly EquityPosition[] = [
    {
      symbol: "AAPL",
      qty: 100,
      avgPrice: 180,
      markPrice: 182,
      unrealisedPnl: 200,
    },
    {
      symbol: "JPM",
      qty: 50,
      avgPrice: 200,
      markPrice: 198,
      unrealisedPnl: -100,
    },
  ];
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(positions)}>
      <PositionsBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("desk-pnl-gauge")).toBeTruthy();
  expect(screen.getByTestId("position-row-AAPL")).toBeTruthy();
  expect(screen.getByTestId("position-row-JPM")).toBeTruthy();
});

test("shows the gauge and an empty state with no positions", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith([])}>
      <PositionsBlotter />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("desk-pnl-gauge")).toBeTruthy();
  expect(screen.getByTestId("positions-empty")).toBeTruthy();
});

function vmWith(positions: readonly EquityPosition[]): ViewModel {
  return {
    useEquityPositions: () => {
      return positions;
    },
  } as unknown as ViewModel;
}
