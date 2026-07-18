import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  LiveRatesHeadControls,
  LiveRatesPanel,
} from "#/fx/LiveRates/LiveRatesPanel";
import { useFxRates } from "#/fx/useFxRates";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(cleanup);

describe("LiveRatesHeadControls", () => {
  test("renders the view tabs and CHARTS switch, and reports clicks", () => {
    const onView = vi.fn();
    const onToggleCharts = vi.fn();
    const { getByText } = render(
      <LiveRatesHeadControls
        view="rates"
        onView={onView}
        showCharts={false}
        onToggleCharts={onToggleCharts}
      />,
    );

    getByText("☰ Watchlist").click();
    expect(onView).toHaveBeenCalledWith("watch");

    getByText("CHARTS").click();
    expect(onToggleCharts).toHaveBeenCalled();
  });
});

describe("LiveRatesPanel", () => {
  test("no longer renders its own view tabs — that's Panel's headControls now", () => {
    const { result } = renderHook(() => {
      return useFxRates();
    });

    const { queryByText } = render(
      <PreferencesProvider>
        <LiveRatesPanel
          rates={result.current}
          filter="All"
          onFilter={vi.fn()}
          view="rates"
          showCharts={false}
        />
      </PreferencesProvider>,
    );

    expect(queryByText("◧ Live Rates")).toBeNull();
    expect(queryByText("☰ Watchlist")).toBeNull();
    expect(queryByText("CHARTS")).toBeNull();
  });
});
