import { LiveRatesWorkspace } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { KNOWN_CURRENCY_PAIRS } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("LiveRatesHead + LiveRatesPanel", () => {
  it("defaults to the Live Rates tab with the tile grid showing", () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: KNOWN_CURRENCY_PAIRS },
    });
    expect(page.isRatesTabActive()).toBe(true);
    expect(page.isWatchlistTabActive()).toBe(false);
    expect(page.hasWatchlistPlaceholder()).toBe(false);
  });

  it("swaps the panel body to the watchlist view when Watchlist is selected", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: KNOWN_CURRENCY_PAIRS },
    });
    await page.selectWatchlistTab();
    expect(page.isWatchlistTabActive()).toBe(true);
    expect(page.isRatesTabActive()).toBe(false);
    expect(page.hasWatchlistPlaceholder()).toBe(false);
    expect(page.hasWatchlistView()).toBe(true);
    expect(page.watchRowCount()).toBe(KNOWN_CURRENCY_PAIRS.length);
  });

  it("returns to the tile grid when Live Rates is reselected", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: KNOWN_CURRENCY_PAIRS },
    });
    await page.selectWatchlistTab();
    await page.selectRatesTab();
    expect(page.hasWatchlistView()).toBe(false);
    expect(page.isRatesTabActive()).toBe(true);
  });

  it("reflects the seeded view mode on the CHARTS chip and tile charts", () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: KNOWN_CURRENCY_PAIRS },
      viewMode: "price",
    });
    expect(page.isChartsActive()).toBe(false);
    expect(page.hasAnyChart()).toBe(false);
  });

  it("toggles the CHARTS chip, showing and hiding tile sparklines", async () => {
    const page = mount(LiveRatesWorkspace, {
      hooks: { useCurrencyPairs: KNOWN_CURRENCY_PAIRS },
    });
    expect(page.isChartsActive()).toBe(true);
    expect(page.hasAnyChart()).toBe(true);
    await page.toggleCharts();
    expect(page.isChartsActive()).toBe(false);
    expect(page.hasAnyChart()).toBe(false);
  });
});
