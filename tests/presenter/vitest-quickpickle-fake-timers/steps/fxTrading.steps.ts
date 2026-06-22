// tests/presenter/vitest-quickpickle-fake-timers/steps/fxTrading.steps.ts
import { Then, When } from "quickpickle";

import * as trading from "#/presenter/scenarios/_shared/fxTrading";

import type { VitestFakePresenterWorld } from "../world";

When(
  "the trader clicks buy on the first tile",
  async (state: VitestFakePresenterWorld) =>
    trading.executeBuyOnFirstTile(state),
);

When(
  "the trader clicks sell on the first tile",
  async (state: VitestFakePresenterWorld) =>
    trading.executeSellOnFirstTile(state),
);

When(
  "the trader executes a buy for {string} on the first tile",
  async (state: VitestFakePresenterWorld, notional: string) =>
    trading.executeBuyWithNotional(state, Number(notional)),
);

When(
  "the trader buys {int} times with confirmation dismissals",
  async (state: VitestFakePresenterWorld, n: number) =>
    trading.buyNTimesWithDismissals(state, n),
);

When(
  "the trader dismisses the trade confirmation",
  async (state: VitestFakePresenterWorld) =>
    trading.dismissTradeConfirmation(state),
);

Then(
  "the trade confirmation appears within {int} seconds",
  async (_state: VitestFakePresenterWorld, _n: number) => {
    // implicit: executeBuyOnFirstTile awaits the confirmation already (status captured)
  },
);

Then(
  /^the trade confirmation matches one of (\/.*\/[gimsuy]?(?:,\s*\/.*\/[gimsuy]?)*)$/,
  async (state: VitestFakePresenterWorld, regexList: string) => {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(state, patterns);
  },
);

Then(
  "the trade confirmation matches one of {} within {int} seconds",
  async (state: VitestFakePresenterWorld, regexList: string, _n: number) => {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(state, patterns);
  },
);

Then(
  "the trade confirmation hides within {int} seconds",
  async (state: VitestFakePresenterWorld, _n: number) =>
    trading.expectTradeConfirmationHides(state),
);

Then(
  "at least one trade was rejected",
  async (state: VitestFakePresenterWorld) =>
    trading.expectAtLeastOneRejection(state),
);

Then(
  "the executed trade carries notional {string}",
  async (state: VitestFakePresenterWorld, value: string) =>
    trading.expectTradeNotionalEquals(state, Number(value)),
);

function parseRegexList(raw: string): RegExp[] {
  // Splits "/A/i, /B/i, /C/i" into [/A/i, /B/i, /C/i]
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => {
      const m = s.match(/^\/(.+)\/([a-z]*)$/);
      if (!m) throw new Error(`bad regex literal in: ${s}`);
      const [, pattern, flags] = m;
      return new RegExp(pattern, flags);
    });
}
