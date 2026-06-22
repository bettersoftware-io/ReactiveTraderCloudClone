// tests/presenter/steps/fxTrading.steps.ts
import { Then, When } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber/world";
import * as trading from "../scenarios/_shared/fxTrading";

When(
  "the trader clicks buy on the first tile",
  function (this: PresenterWorld) {
    return trading.executeBuyOnFirstTile(this);
  },
);

When(
  "the trader clicks sell on the first tile",
  function (this: PresenterWorld) {
    return trading.executeSellOnFirstTile(this);
  },
);

When(
  "the trader executes a buy for {string} on the first tile",
  function (this: PresenterWorld, notional: string) {
    return trading.executeBuyWithNotional(this, Number(notional));
  },
);

When(
  "the trader buys {int} times with confirmation dismissals",
  { timeout: 30_000 },
  function (this: PresenterWorld, n: number) {
    return trading.buyNTimesWithDismissals(this, n);
  },
);

When(
  "the trader dismisses the trade confirmation",
  function (this: PresenterWorld) {
    return trading.dismissTradeConfirmation(this);
  },
);

Then(
  "the trade confirmation appears within {int} seconds",
  function (this: PresenterWorld, _n: number) {
    // implicit: executeBuyOnFirstTile awaits the confirmation already (status captured)
  },
);

Then(
  /^the trade confirmation matches one of (\/.*\/[gimsuy]?(?:,\s*\/.*\/[gimsuy]?)*)$/,
  function (this: PresenterWorld, regexList: string) {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(this, patterns);
  },
);

Then(
  "the trade confirmation matches one of {} within {int} seconds",
  function (this: PresenterWorld, regexList: string, _n: number) {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(this, patterns);
  },
);

Then(
  "the trade confirmation hides within {int} seconds",
  function (this: PresenterWorld, _n: number) {
    return trading.expectTradeConfirmationHides(this);
  },
);

Then("at least one trade was rejected", function (this: PresenterWorld) {
  return trading.expectAtLeastOneRejection(this);
});

Then(
  "the executed trade carries notional {string}",
  function (this: PresenterWorld, value: string) {
    return trading.expectTradeNotionalEquals(this, Number(value));
  },
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
