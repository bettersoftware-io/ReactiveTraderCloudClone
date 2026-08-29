import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { InstrumentCard } from "#/ui/equities/trade/InstrumentCard";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("renders symbol, name · exchange, price and signed pct in one card, with the chart inside", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <InstrumentCard symbol="NVDA" candles={[]} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("instrument-card")).toBeTruthy();
  expect(screen.getByText("NVDA")).toBeTruthy();
  expect(screen.getByText("NVIDIA Corp · NASDAQ")).toBeTruthy();
  expect(screen.getByText("131.14")).toBeTruthy();
  expect(screen.getByText("-0.94%")).toBeTruthy();
  expect(screen.getByTestId("eq-candle-empty")).toBeTruthy();
});

test("price and pct take the change colour", async () => {
  const t = rnThemeTokens.holo.dark;
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <InstrumentCard symbol="NVDA" candles={[]} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("131.14")).toHaveStyle({ color: t.accentNegative });
  expect(screen.getByText("-0.94%")).toHaveStyle({ color: t.accentNegative });
});

test("the separator is a real middle dot, not an escape sequence", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <InstrumentCard symbol="NVDA" candles={[]} />
    </ViewModelProvider>,
  );
  expect(screen.queryByText(/\\u00B7/i)).toBeNull();
  expect(screen.getByText(/·/)).toBeTruthy();
});

function vm(): ViewModel {
  return {
    useWatchlist: () => {
      return [{ symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ" }];
    },
    useEquityQuote: () => {
      return {
        symbol: "NVDA",
        bid: 0,
        ask: 0,
        last: 131.14,
        changePct: -0.94,
        timestamp: 0,
      };
    },
  } as unknown as ViewModel;
}

// `vm()` only stubs the two hooks this component reads off the ViewModel
// (useWatchlist/useEquityQuote); useShellMotionEnabled reads `usePowerSaver`
// off the same ViewModel context, so it's mocked directly here rather than
// widening `vm()` — mirrors SpotTile.test.tsx, the other useTickFlash
// consumer.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
