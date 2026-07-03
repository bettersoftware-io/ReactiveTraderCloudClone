import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  WatchlistPanel,
  WatchlistPanelControls,
} from "#/equities/Watchlist/WatchlistPanel";
import type { WatchRowVm } from "#/equities/watchlistVm";
import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";

afterEach(cleanup);

const ROWS: WatchRowVm[] = [
  {
    sym: "AAPL",
    name: "Apple Inc",
    last: "229.35",
    chg: "+0.50%",
    up: true,
    selected: true,
    flashOn: false,
  },
  {
    sym: "MSFT",
    name: "Microsoft Corp",
    last: "467.12",
    chg: "-0.20%",
    up: false,
    selected: false,
    flashOn: false,
  },
];

describe("WatchlistPanel", () => {
  test("renders a row per symbol and marks the selected one", () => {
    const { container } = render(
      <PreferencesProvider>
        <WatchlistPanel rows={ROWS} onSelect={noop} />
      </PreferencesProvider>,
    );
    expect(container.querySelectorAll("[data-watch-sym]")).toHaveLength(2);
    expect(
      container
        .querySelector('[data-watch-sym="AAPL"]')
        ?.getAttribute("data-selected"),
    ).toBe("true");
  });
});

describe("WatchlistPanelControls", () => {
  test("shows the sort label and cycles sort on click", () => {
    let clicks = 0;

    function handleCycle(): void {
      clicks += 1;
    }

    const { getByText } = render(
      <WatchlistPanelControls wlSort="chg" onCycleSort={handleCycle} />,
    );
    expect(getByText("% CHG")).toBeTruthy();

    fireEvent.click(getByText("% CHG"));
    expect(clicks).toBe(1);
  });
});

function noop(): void {}
