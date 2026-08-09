import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { RowSparkline } from "#/ui/equities/markets/RowSparkline";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("draws a path once there are at least two closes", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm([1, 2, 3])}>
      <RowSparkline symbol="TSLA" positive />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("eq-sparkline-TSLA")).toBeTruthy();
});

test("renders nothing when there is not enough history to draw", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm([1])}>
      <RowSparkline symbol="TSLA" positive />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("eq-sparkline-TSLA")).toBeNull();
});

function vm(closes: number[]): ViewModel {
  return {
    useCandles: () => {
      return closes.map((close, i) => {
        return { time: i, open: close, high: close, low: close, close };
      });
    },
  } as unknown as ViewModel;
}
