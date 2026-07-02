import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import type { HistoricPosition } from "@rtc/domain";

import { PnlChart } from "#/ui/analytics/PnlChart";

test("renders a line path when there are at least two points", async () => {
  await render(<PnlChart history={[h(0), h(10)]} />);
  expect(screen.getByTestId("pnl-chart-path")).toBeTruthy();
});

test("renders no line path for fewer than two points", async () => {
  await render(<PnlChart history={[h(5)]} />);
  expect(screen.queryByTestId("pnl-chart-path")).toBeNull();
});

function h(usdPnl: number): HistoricPosition {
  return { timestamp: `t${usdPnl}`, usdPnl };
}
