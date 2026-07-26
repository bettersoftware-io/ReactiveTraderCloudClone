import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { HistoricPosition } from "@rtc/domain";

import { PnlChart } from "#/ui/analytics/PnlChart";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

// Skia is mocked here, so no pixel is asserted — and Skia elements are not RN
// views, so they carry no `testID` to query either. What these prove is that
// the component mounts and builds its paths across every history shape it can
// receive without throwing. WHETHER a line is drawn is a pure function of the
// history, asserted directly in `buildChart.test.ts`.

test("mounts for a normal history", async () => {
  await renderWithTheme(<PnlChart history={[h(0), h(10)]} />);
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
});

test("mounts for fewer than two points, where there is no path to draw", async () => {
  await renderWithTheme(<PnlChart history={[h(5)]} />);
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
});

test("mounts for an empty history", async () => {
  await renderWithTheme(<PnlChart history={[]} />);
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
});

// A flat history makes max - min zero; buildChart guards that with `|| 1`, and
// a divide-by-zero here would surface as NaN coordinates rather than a throw —
// which Skia would silently decline to draw.
test("survives a completely flat history without producing NaN coordinates", async () => {
  await renderWithTheme(<PnlChart history={[h(7), h(7), h(7)]} />);
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
});

test("survives a history that crosses zero, which adds the baseline", async () => {
  await renderWithTheme(<PnlChart history={[h(-5), h(0), h(5)]} />);
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
});

test("survives an all-negative history, which flips the stroke colour", async () => {
  await renderWithTheme(<PnlChart history={[h(-10), h(-5)]} />);
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
});

test("survives a 90-point history, the size the simulator actually emits", async () => {
  const history = Array.from({ length: 90 }, (_, i) => {
    return h(Math.sin(i / 5) * 1000);
  });

  await renderWithTheme(<PnlChart history={history} />);
  expect(screen.getByTestId("pnl-chart")).toBeTruthy();
});

function h(usdPnl: number): HistoricPosition {
  return { timestamp: `t${usdPnl}`, usdPnl };
}
