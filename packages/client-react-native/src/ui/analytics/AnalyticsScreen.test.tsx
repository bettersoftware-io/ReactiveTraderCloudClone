import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { PositionUpdates } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AnalyticsScreen } from "#/ui/analytics/AnalyticsScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const DATA: PositionUpdates = {
  history: [
    { timestamp: "t0", usdPnl: 0 },
    { timestamp: "t1", usdPnl: 1200 },
  ],
  currentPositions: [
    {
      symbol: "EURUSD",
      basePnl: 12000,
      baseTradedAmount: 1_000_000,
      counterTradedAmount: -1_100_000,
    },
  ],
};

test("shows a loading state before the first emission", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(null, false)}>
      <AnalyticsScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("analytics-loading")).toBeTruthy();
  expect(screen.queryByTestId("analytics-panel")).toBeNull();
});

test("renders the three sections when data has arrived", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(DATA, false)}>
      <AnalyticsScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("analytics-panel")).toBeTruthy();
  expect(screen.getByTestId("analytics-widget-pnl")).toBeTruthy();
  expect(screen.getByTestId("analytics-widget-exposure")).toBeTruthy();
  expect(screen.getByTestId("analytics-widget-pairs")).toBeTruthy();
  expect(screen.getByTestId("pnl-value")).toBeTruthy();
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
  expect(screen.getByTestId("exposure-bubbles")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-bars")).toBeTruthy();
  expect(screen.getByTestId("pair-pnl-row-EURUSD")).toBeTruthy();
  expect(screen.queryByTestId("analytics-stale")).toBeNull();
});

test("surfaces a stale indicator when the stream is stale", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(DATA, true)}>
      <AnalyticsScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("analytics-stale")).toBeTruthy();
});

function fakeViewModel(
  data: PositionUpdates | null,
  stale: boolean,
): ViewModel {
  return {
    useAnalytics: () => {
      return data;
    },
    useAnalyticsStaleFlag: () => {
      return stale;
    },
  } as unknown as ViewModel;
}
