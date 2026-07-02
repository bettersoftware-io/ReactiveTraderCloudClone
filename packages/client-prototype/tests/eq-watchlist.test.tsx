import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { WatchlistPanel } from "#/equities/Watchlist/WatchlistPanel";
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
  test("renders a row per symbol, marks the selected one, shows the sort label", () => {
    const { container, getByText } = render(
      <PreferencesProvider>
        <WatchlistPanel
          rows={ROWS}
          wlSort="chg"
          onSelect={noop}
          onCycleSort={noop}
        />
      </PreferencesProvider>,
    );
    expect(container.querySelectorAll("[data-watch-sym]")).toHaveLength(2);
    expect(
      container
        .querySelector('[data-watch-sym="AAPL"]')
        ?.getAttribute("data-selected"),
    ).toBe("true");
    expect(getByText("% CHG")).toBeTruthy();
  });
});

function noop(): void {}
