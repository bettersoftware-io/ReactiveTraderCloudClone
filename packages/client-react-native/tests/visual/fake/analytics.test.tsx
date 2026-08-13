import { describe, expect, it } from "@jest/globals";

import { analyticsSlice } from "./analytics";

describe("analyticsSlice.useAnalytics", () => {
  it("returns the same book, by reference, on every call", () => {
    const first = analyticsSlice.useAnalytics();
    const second = analyticsSlice.useAnalytics();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it("is never null", () => {
    expect(analyticsSlice.useAnalytics()).not.toBeNull();
  });

  it("spans both signs in currentPositions", () => {
    const book = analyticsSlice.useAnalytics();
    const pnls =
      book?.currentPositions.map((position) => {
        return position.basePnl;
      }) ?? [];

    expect(
      pnls.some((pnl) => {
        return pnl > 0;
      }),
    ).toBe(true);
    expect(
      pnls.some((pnl) => {
        return pnl < 0;
      }),
    ).toBe(true);
  });

  it("has a non-empty history series", () => {
    const book = analyticsSlice.useAnalytics();

    expect(book?.history.length).toBeGreaterThan(0);
  });

  it("orders history strictly ascending in time", () => {
    const book = analyticsSlice.useAnalytics();
    const timestamps = (book?.history ?? []).map((point) => {
      return Date.parse(point.timestamp);
    });

    for (let index = 1; index < timestamps.length; index++) {
      expect(timestamps[index]).toBeGreaterThan(timestamps[index - 1]);
    }
  });

  it("pins every history timestamp to an exact expected literal", () => {
    const book = analyticsSlice.useAnalytics();
    const timestamps = (book?.history ?? []).map((point) => {
      return point.timestamp;
    });

    // Independently hand-computed against PINNED_NOW_MS / MINUTE_MS from
    // pinnedClock.ts, not re-derived through the slice's own arithmetic — a
    // future clock read (or a step-size edit) must fail this loudly rather
    // than pass because both sides drifted together.
    expect(timestamps).toStrictEqual([
      "2026-07-27T10:10:00.000Z",
      "2026-07-27T10:20:00.000Z",
      "2026-07-27T10:30:00.000Z",
      "2026-07-27T10:40:00.000Z",
      "2026-07-27T10:50:00.000Z",
      "2026-07-27T11:00:00.000Z",
      "2026-07-27T11:10:00.000Z",
      "2026-07-27T11:20:00.000Z",
      "2026-07-27T11:30:00.000Z",
      "2026-07-27T11:40:00.000Z",
      "2026-07-27T11:50:00.000Z",
      "2026-07-27T12:00:00.000Z",
    ]);
  });
});

describe("analyticsSlice.useAnalyticsStaleFlag", () => {
  it("is always false", () => {
    expect(analyticsSlice.useAnalyticsStaleFlag()).toBe(false);
  });
});
