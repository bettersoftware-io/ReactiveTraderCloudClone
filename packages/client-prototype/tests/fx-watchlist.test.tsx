import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import type { WatchRow } from "#/fx/LiveRates/WatchlistView";
import { WatchlistView } from "#/fx/LiveRates/WatchlistView";

afterEach(cleanup);

describe("WatchlistView", () => {
  test("renders a header row and one compact row per pair with a mini sparkline", () => {
    const { getByText, container } = render(
      <WatchlistView rows={[makeRow({}), makeRow({ sym: "GBPUSD" })]} />,
    );

    expect(getByText("EURUSD")).toBeTruthy();
    expect(getByText("GBPUSD")).toBeTruthy();
    expect(getByText("Pair")).toBeTruthy();
    expect(getByText("Mid")).toBeTruthy();
    expect(getByText("Move")).toBeTruthy();
    expect(getByText("Spread")).toBeTruthy();
    expect(getByText("Trend")).toBeTruthy();
    expect(container.querySelectorAll("svg").length).toBe(2);
  });
});

function makeRow(overrides: Partial<WatchRow>): WatchRow {
  return {
    sym: "EURUSD",
    mid: "1.09213",
    movePips: 4,
    moveUp: true,
    spread: "1.4",
    hist: Array.from({ length: 30 }, (_v, i) => {
      return 1.09 + i * 1e-4;
    }),
    ...overrides,
  };
}
