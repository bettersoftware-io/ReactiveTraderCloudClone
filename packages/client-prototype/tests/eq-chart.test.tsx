import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ChartPanel, ChartPanelControls } from "#/equities/Chart/ChartPanel";
import { useEqChart } from "#/equities/useEqChart";
import { useEquities } from "#/equities/useEquities";
import { mulberry32 } from "#/mock/rng";

afterEach(cleanup);

describe("ChartPanel", () => {
  test("renders the selected symbol and 40 candles", () => {
    const { container, getAllByText } = renderChart();
    expect(getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-candle]")).toHaveLength(40);
  });
});

describe("ChartPanelControls", () => {
  test("renders one instrument tab and 4 timeframe pills", () => {
    const { container, getAllByText } = renderChartControls();
    expect(getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-tf]")).toHaveLength(4);
  });
});

function renderChart(): ReturnType<typeof render> {
  const chart = renderHook(() => {
    return useEqChart({ rng: mulberry32(1) });
  }).result.current;
  const eng = renderHook(() => {
    return useEquities({ rng: mulberry32(1) });
  }).result.current;

  return render(
    <ChartPanel
      chart={chart}
      rates={eng.rates}
      prev={eng.prev}
      flash={eng.flash}
      vol={eng.vol}
      now={0}
    />,
  );
}

function renderChartControls(): ReturnType<typeof render> {
  const chart = renderHook(() => {
    return useEqChart({ rng: mulberry32(1) });
  }).result.current;

  return render(<ChartPanelControls chart={chart} />);
}
