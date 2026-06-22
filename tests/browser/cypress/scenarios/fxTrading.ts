// tests/browser/cypress/scenarios/fxTrading.ts
// Cypress fork of tests/browser/scenarios/fxTrading.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.

import { assertGte, assertTrue } from "#/browser/scenarios/assert";
import type { TestContext } from "#/browser/testContext";

import { chainable } from "./_chainable";

export function clickBuyOnFirstTile(ctx: TestContext): void {
  void ctx.po.liveRatesTile.clickBuyOnFirst();
}

export function clickSellOnFirstTile(ctx: TestContext): void {
  void ctx.po.liveRatesTile.clickSellOnFirst();
}

export function expectTradeConfirmationWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.liveRatesTile.waitForConfirmation(seconds * 1_000);
}

export function expectTradeConfirmationMatchesOneOf(
  ctx: TestContext,
  rawRegex: string,
  timeoutMs?: number,
): void {
  const patterns = rawRegex
    .split(",")
    .map((s) => {
      return s.trim();
    })
    .filter(Boolean)
    .map((token) => {
      const m = token.match(/^\/(.+)\/([gimsuy]*)$/);
      if (!m) throw new Error(`bad regex literal: ${token}`);
      return new RegExp(m[1], m[2]);
    });
  void ctx.po.liveRatesTile.confirmationContainsAny(
    patterns,
    timeoutMs ?? 5_000,
  );
}

export function dismissTradeConfirmation(ctx: TestContext): void {
  void ctx.po.liveRatesTile.dismissConfirmation();
}

export function expectTradeConfirmationHidesWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.liveRatesTile.confirmationHidden(seconds * 1_000);
}

export function expectBlotterVisible(ctx: TestContext): void {
  // Mirror the shared scenarios approach: isVisible() reads display !== "none"
  // rather than Cypress's viewport-based :visible. The blotter sits below the
  // fold so waitVisible()/.should("be.visible") would fail even when fully
  // rendered. See BlotterTable.ts comment on isVisible() for the same rationale.
  chainable(ctx.po.blotterTable.isVisible()).then((v) => {
    return assertTrue(v, "blotter table not visible");
  });
}

export function expectBlotterHasAtLeastNRows(
  ctx: TestContext,
  n: number,
): void {
  chainable(ctx.po.blotterTable.rowCount()).then((count) => {
    return assertGte(count, n);
  });
}

export function expectFirstTileNotionalInputVisible(ctx: TestContext): void {
  chainable(ctx.po.liveRatesTile.isNotionalInputVisible()).then((v) => {
    return assertTrue(v, "first-tile notional input not visible");
  });
}

export function setFirstTileNotional(ctx: TestContext, value: string): void {
  void ctx.po.liveRatesTile.fillFirstTileNotional(value);
}

export function setNotionalAndBuy(ctx: TestContext, value: string): void {
  void ctx.po.liveRatesTile.fillFirstTileNotional(value);
  void ctx.po.liveRatesTile.clickBuyOnFirst();
}

export function expectBlotterContainsText(
  ctx: TestContext,
  text: string,
): void {
  // The blotter renders a numeric notional locale-formatted ("1000000" →
  // "1,000,000"); assert on the formatted form (non-numeric text is unchanged).
  // expectContainsText uses cy.should auto-retry — no fixed cy.wait, no race.
  const expected = Number.isFinite(Number(text))
    ? Number(text).toLocaleString("en-US", { maximumFractionDigits: 0 })
    : text;
  void ctx.po.blotterTable.expectContainsText(expected, 10_000);
}

export function clickBuyOnGbpjpy(ctx: TestContext): void {
  void ctx.po.liveRatesTile.clickBuyOnPair("GBPJPY");
}

export function expectAtLeastOneRejectionInBlotter(ctx: TestContext): void {
  void ctx.po.blotterTable.expectContainsText("Rejected", 10_000);
}
