// tests/presenter/steps/fxTrading.steps.ts
import { Then, When } from "@cucumber/cucumber";

import type { PresenterWorld } from "../cucumber-fake-timers/world";
import * as trading from "../scenarios/_shared/fxTrading";

When(
  "the trader clicks buy on the first tile",
  function traderClicksBuyOnFirstTile(this: PresenterWorld) {
    return trading.executeBuyOnFirstTile(this);
  },
);

When(
  "the trader clicks sell on the first tile",
  function traderClicksSellOnFirstTile(this: PresenterWorld) {
    return trading.executeSellOnFirstTile(this);
  },
);

When(
  "the trader executes a buy for {string} on the first tile",
  function traderExecutesBuyForNotional(
    this: PresenterWorld,
    notional: string,
  ) {
    return trading.executeBuyWithNotional(this, Number(notional));
  },
);

When(
  "the trader buys {int} times with confirmation dismissals",
  { timeout: 30_000 },
  function traderBuysNTimesWithDismissals(this: PresenterWorld, n: number) {
    return trading.buyNTimesWithDismissals(this, n);
  },
);

When(
  "the trader dismisses the trade confirmation",
  function traderDismissesTradeConfirmation(this: PresenterWorld) {
    // UI-only: at the presenter tier the confirmation observable completes after
    // one emission — there is nothing to dismiss. (This step belongs to a
    // browser-only scenario the @presenter peer skips; kept for shared vocabulary.)
  },
);

Then(
  "the trade confirmation appears within {int} seconds",
  function tradeConfirmationAppearsWithin(this: PresenterWorld, _n: number) {
    // implicit: executeBuyOnFirstTile awaits the confirmation already (status captured)
  },
);

Then(
  // `[^/]*` (not `.*`) keeps each /…/ token bounded by its delimiters — linear
  // matching, no catastrophic backtracking (CodeQL js/redos). Regex literals in
  // the .feature steps never contain an inner `/`, so this preserves behaviour.
  /^the trade confirmation matches one of (\/[^/]*\/[gimsuy]?(?:,\s*\/[^/]*\/[gimsuy]?)*)$/,
  function tradeConfirmationMatchesOneOfRegex(
    this: PresenterWorld,
    regexList: string,
  ) {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(this, patterns);
  },
);

Then(
  "the trade confirmation matches one of {} within {int} seconds",
  function tradeConfirmationMatchesOneOfWithin(
    this: PresenterWorld,
    regexList: string,
    _n: number,
  ) {
    const patterns = parseRegexList(regexList);
    return trading.expectTradeConfirmationMatchesOneOf(this, patterns);
  },
);

Then(
  "the trade confirmation hides within {int} seconds",
  function tradeConfirmationHidesWithin(this: PresenterWorld, _n: number) {
    // UI-only counterpart to "dismiss" — no presenter-tier state models a hidden
    // confirmation panel. Browser-only scenario; the @presenter peer skips it.
  },
);

Then(
  "at least one trade was rejected",
  function atLeastOneTradeRejected(this: PresenterWorld) {
    return trading.expectAtLeastOneRejection(this);
  },
);

Then(
  "the executed trade carries notional {string}",
  function executedTradeCarriesNotional(this: PresenterWorld, value: string) {
    return trading.expectTradeNotionalEquals(this, Number(value));
  },
);

function parseRegexList(raw: string): RegExp[] {
  // Splits "/A/i, /B/i, /C/i" into [/A/i, /B/i, /C/i]
  return raw
    .split(",")
    .map((s) => {
      return s.trim();
    })
    .map((s) => {
      const m = s.match(/^\/(.+)\/([a-z]*)$/);

      if (!m) {
        throw new Error(`bad regex literal in: ${s}`);
      }

      const [, pattern, flags] = m;
      return new RegExp(pattern, flags);
    });
}
