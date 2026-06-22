// tests/browser/cypress/scenarios/fxLiveRates.ts
// Cypress fork of tests/browser/scenarios/fxLiveRates.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.

import {
  assertContains,
  assertEquals,
  assertGreaterThanZero,
  assertGte,
  assertLte,
  assertTrue,
} from "#/browser/scenarios/assert";
import type { TestContext } from "#/browser/testContext";

import { chainable } from "./_chainable";

export function expectFirstPriceTileVisibleWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.liveRatesTile.waitForFirstTile(seconds * 1_000);
}

export function expectAtLeastNTilesVisible(ctx: TestContext, n: number): void {
  chainable(ctx.po.liveRatesTile.count()).then((c) => {
    return assertGte(c, n);
  });
}

export function expectFirstTileHasBuyAndSellButtons(ctx: TestContext): void {
  chainable(ctx.po.liveRatesTile.firstTileSellVisible()).then((v) => {
    return assertTrue(v, "first tile sell button not visible");
  });
  chainable(ctx.po.liveRatesTile.firstTileBuyVisible()).then((v) => {
    return assertTrue(v, "first tile buy button not visible");
  });
}

export function recordVisibleTileCount(ctx: TestContext, key: string): void {
  chainable(ctx.po.liveRatesTile.count()).then((n) => {
    ctx.scratch.fxLiveRates.recordedCounts.set(key, n);
  });
}

export function clickCurrencyFilter(ctx: TestContext, category: string): void {
  void ctx.po.liveRatesTile.clickFilter(category);
}

export function expectVisibleTileCountAtMost(
  ctx: TestContext,
  key: string,
): void {
  // Read the scratchpad baseline INSIDE the chainable's .then callback so the
  // read happens after the prior recordVisibleTileCount has drained the cy
  // queue. A bare ctx.scratch read at the JS call site would fire before any
  // queued PO call resolves and miss the baseline. See Phase 5A.4 spec §3.3.
  chainable(ctx.po.liveRatesTile.count()).then((n) => {
    const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
    assertLte(n, baseline);
  });
}

export function expectVisibleTileCountEquals(
  ctx: TestContext,
  key: string,
): void {
  chainable(ctx.po.liveRatesTile.count()).then((n) => {
    const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
    assertEquals(n, baseline);
  });
}

export function expectViewToggleVisible(ctx: TestContext): void {
  chainable(ctx.po.liveRatesTile.viewToggleVisible()).then((v) => {
    return assertTrue(v, "view toggle not visible");
  });
}

export function expectViewToggleShows(
  ctx: TestContext,
  expected: string,
): void {
  chainable(ctx.po.liveRatesTile.viewToggleLabel()).then((label) => {
    return assertContains(label, expected);
  });
}

export function clickViewToggle(ctx: TestContext): void {
  void ctx.po.liveRatesTile.clickViewToggle();
}

export function recordFirstTileText(ctx: TestContext): void {
  chainable(ctx.po.liveRatesTile.firstTileText()).then((s) => {
    ctx.scratch.fxLiveRates.firstTileTextSnapshot = s;
  });
}

export function expectFirstTileTextNonEmpty(ctx: TestContext): void {
  // Read snapshot inside the chainable's .then callback so the read happens
  // after the prior recordFirstTileText has drained the cy queue.
  chainable(ctx.po.liveRatesTile.firstTileText()).then((current) => {
    assertGreaterThanZero(
      ctx.scratch.fxLiveRates.firstTileTextSnapshot?.length ?? 0,
      "snapshot length should be > 0",
    );
    assertGreaterThanZero(
      current.length,
      "current first tile text should be non-empty",
    );
  });
}

export function expectAtLeastNTilesVisibleWithin(
  ctx: TestContext,
  n: number,
  seconds: number,
): void {
  void ctx.po.liveRatesTile.waitForFirstTile(seconds * 1_000);
  chainable(ctx.po.liveRatesTile.count()).then((c) => {
    return assertGte(c, n);
  });
}

export function expectFirstTileTextMatches(
  ctx: TestContext,
  pattern: RegExp,
): void {
  chainable(ctx.po.liveRatesTile.firstTileText()).then((text) => {
    return assertTrue(
      pattern.test(text),
      `first tile text "${text}" did not match ${pattern}`,
    );
  });
}
