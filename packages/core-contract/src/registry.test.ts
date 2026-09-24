import { describe, expect, it } from "vitest";

import { CONTRACT_SUITES, PENDING_SUITES } from "#/registry";

describe("core-contract registry", () => {
  it("every member without a suite is listed in PENDING_SUITES, and nothing else is", () => {
    const pending = Object.entries(CONTRACT_SUITES)
      .filter(([, suite]) => {
        return suite === null;
      })
      .map(([member]) => {
        return member;
      })
      .sort();
    expect(pending).toEqual([...PENDING_SUITES].sort());
  });

  it("slice 1a members have suites", () => {
    for (const member of [
      "presenters.connection",
      "presenters.themePreference",
      "presenters.themeSkinPreference",
      "presenters.viewModePreference",
      "presenters.powerSaver",
      "commands.reconnect",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });

  it("slice 1b members have suites", () => {
    for (const member of [
      "presenters.creditRfqFilterPreference",
      "presenters.eqWatchlistSortPreference",
      "presenters.eqBlotterViewPreference",
      "presenters.bootPreference",
      "presenters.loginWaitPreferences",
      "presenters.jarvisPreferences",
      "presenters.animatedBackground",
      "presenters.ambientStyle",
      "presenters.chartSubstrate",
      "presenters.layoutEngine",
      "presenters.forceBootAnimation",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });

  it("slice 2 members have suites", () => {
    for (const member of [
      "presenters.priceStream",
      "presenters.priceHistory",
      "presenters.currencyPairs",
      "presenters.blotter",
      "presenters.analytics",
      "presenters.execution",
      "machines.staleFlag",
      "machines.analyticsStaleFlag",
      "machines.rowHighlight",
      "machines.notional",
      "machines.tileExecution",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });

  it("slice 3 members have suites", () => {
    for (const member of [
      "presenters.rfqs",
      "presenters.dealers",
      "presenters.instruments",
      "presenters.rfqQuote",
      "machines.rfqTile",
      "machines.rfqSubmission",
      "machines.ticketSubmission",
      "machines.rfqCountdown",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });

  it("slice 4 members have suites", () => {
    for (const member of [
      "presenters.watchlist",
      "presenters.candleSeries",
      "presenters.depth",
      "presenters.ordersBlotter",
      "presenters.positions",
      "presenters.eqWorkspace",
      "presenters.eqDrawings",
      "machines.orderTicket",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });

  it("slice 7 members have suites, and none is pending", () => {
    for (const member of [
      "presenters.jarvis",
      "presenters.jarvisUsage",
      "presenters.jarvisDriver",
      "presenters.jarvisDemo",
      "presenters.jarvisPanels",
      "presenters.layoutPresets",
      "machines.layout",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }

    expect(PENDING_SUITES).toEqual([]);
  });

  it("slice 5 members have suites", () => {
    for (const member of [
      "presenters.throughput",
      "presenters.throughputMetric",
      "presenters.latencyMetric",
      "presenters.errorRateMetric",
      "presenters.topology",
      "presenters.eventLog",
      "presenters.sessions",
      "presenters.sessionsKpi",
      "presenters.incident",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });
});
