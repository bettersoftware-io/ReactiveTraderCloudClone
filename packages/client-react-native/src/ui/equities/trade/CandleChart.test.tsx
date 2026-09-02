import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { Candle } from "@rtc/domain";

import { CandleChart } from "#/ui/equities/trade/CandleChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

test("renders the canvas once candles exist", async () => {
  await renderWithTheme(<CandleChart candles={candles(3)} />);
  expect(screen.getByTestId("eq-candle-chart")).toBeTruthy();
});

test("shows an empty state instead of a blank canvas with no candles", async () => {
  await renderWithTheme(<CandleChart candles={candles(0)} />);
  expect(screen.getByTestId("eq-candle-empty")).toBeTruthy();
});

// Recovered from the deleted PriceChart.test.tsx (this component's SVG
// predecessor), which asserted the same thing for the same reason: a live
// convention still carried by rfqTiles/QuoteCard.test.tsx. `CandleChart` is
// chrome-less since the fidelity pass (it sits inside `InstrumentCard`'s
// tile, which owns the gradient surface) so it never mounts a `SurfaceCard`,
// sheen or otherwise — this asserts that stays true.
test("renders no gradient tile surface even on a 3d skin (dense panel, not a hero tile)", async () => {
  await renderWithTheme(
    <CandleChart candles={candles(3)} />,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

function candles(n: number): readonly Candle[] {
  return Array.from({ length: n }, (_, i) => {
    return { time: i, open: 10, high: 12, low: 9, close: 11, volume: 1000 };
  });
}

// CandleChart reads useShellMotionEnabled for the body morph; that hook reads
// `usePowerSaver` off the ViewModel context, so it's mocked directly here —
// the SpotTile.test.tsx pattern, same reason.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
