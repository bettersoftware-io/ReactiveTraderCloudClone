import { AnalyticsPanel } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import {
  ConnectionStatus,
  type CurrencyPairPosition,
  type HistoricPosition,
  type PositionUpdates,
} from "@rtc/domain";

afterEach(() => cleanupMounted());

const historic = (
  usdPnl: number,
  timestamp = "2026-06-13T00:00:00Z",
): HistoricPosition => ({
  timestamp,
  usdPnl,
});

const position = (symbol: string, basePnl: number): CurrencyPairPosition => ({
  symbol,
  basePnl,
  baseTradedAmount: 1_000_000,
  counterTradedAmount: 1_090_000,
});

const updates = (over: Partial<PositionUpdates> = {}): PositionUpdates => ({
  currentPositions: [position("EURUSD", 12_500)],
  history: [historic(0, "2026-06-13T00:00:00Z"), historic(12_500)],
  ...over,
});

describe("AnalyticsPanel", () => {
  it("shows a loading placeholder until analytics data arrives", () => {
    const panel = mount(AnalyticsPanel, { hooks: { useAnalytics: null } });
    expect(panel.isLoaded()).toBe(false);
    expect(panel.loadingMessage()).toMatch(/loading analytics/i);
  });

  it("renders the panel and its sections once data is present", () => {
    const panel = mount(AnalyticsPanel, { hooks: { useAnalytics: updates() } });
    expect(panel.isLoaded()).toBe(true);
    expect(panel.loadingMessage()).toBeNull();
    expect(panel.sectionLabels()).toEqual([
      "Profit & Loss",
      "Positions",
      "PnL per Currency Pair",
    ]);
  });

  it("summarises the latest historic P&L figure", () => {
    const panel = mount(AnalyticsPanel, {
      hooks: {
        useAnalytics: updates({ history: [historic(0), historic(1_500_000)] }),
      },
    });
    expect(panel.latestPnlText()).toBe("+1.50m");
  });

  it("falls back to zero P&L when there is no history", () => {
    const panel = mount(AnalyticsPanel, {
      hooks: { useAnalytics: updates({ history: [] }) },
    });
    expect(panel.isLoaded()).toBe(true);
    expect(panel.latestPnlText()).toBe("+0");
  });

  it("transitions from loading to loaded when analytics begin streaming", () => {
    const panel = mount(AnalyticsPanel, { hooks: { useAnalytics: null } });
    expect(panel.isLoaded()).toBe(false);
    panel.emit({
      useAnalytics: updates({ history: [historic(0), historic(-2_500)] }),
    });
    expect(panel.isLoaded()).toBe(true);
    expect(panel.latestPnlText()).toBe("-2.5k");
  });

  it("updates the summarised P&L figure when newer analytics stream in", () => {
    const panel = mount(AnalyticsPanel, {
      hooks: {
        useAnalytics: updates({ history: [historic(0), historic(500)] }),
      },
    });
    expect(panel.latestPnlText()).toBe("+500");
    panel.emit({
      useAnalytics: updates({
        history: [historic(0), historic(500), historic(12_500)],
      }),
    });
    expect(panel.latestPnlText()).toBe("+12.5k");
  });

  it("shows the stale overlay after a disconnect/reconnect with no fresh data", () => {
    const data = updates();
    const panel = mount(AnalyticsPanel, {
      hooks: {
        useAnalytics: data,
        useConnectionStatus: ConnectionStatus.CONNECTED,
      },
    });
    expect(panel.isStale()).toBe(false);

    // Drop the connection, then reconnect without a new analytics reference.
    panel.emit({ useConnectionStatus: ConnectionStatus.DISCONNECTED });
    panel.emit({ useConnectionStatus: ConnectionStatus.CONNECTED });
    expect(panel.isStale()).toBe(true);

    // A fresh analytics reference clears the stale flag.
    panel.emit({
      useAnalytics: updates({ history: [historic(0), historic(7_000)] }),
    });
    expect(panel.isStale()).toBe(false);
    expect(panel.latestPnlText()).toBe("+7.0k");
  });
});
