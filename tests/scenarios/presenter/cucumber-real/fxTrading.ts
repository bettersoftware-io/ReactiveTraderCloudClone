// tests/scenarios/presenter/cucumber-real/fxTrading.ts
//
// NOTE: Direction and ExecutionStatus are `const enum` types in @rtc/domain.
// With verbatimModuleSyntax + isolatedModules, ambient const enums cannot be
// accessed as values from a different package. We import them as types only
// and cast their string literals to the correct type via `as unknown as`.
import { firstValueFrom, take, timeout } from "rxjs";
import type { Direction, ExecutionStatus } from "@rtc/domain";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

// String-literal stand-ins for Direction const enum values.
const DIR_BUY = "Buy" as unknown as Direction;
const DIR_SELL = "Sell" as unknown as Direction;

// String-literal stand-ins for ExecutionStatus const enum values.
const ES_DONE = "Done" as unknown as ExecutionStatus;
const ES_REJECTED = "Rejected" as unknown as ExecutionStatus;
const ES_CREDIT_EXCEEDED = "CreditExceeded" as unknown as ExecutionStatus;
const ES_TIMEOUT = "Timeout" as unknown as ExecutionStatus;

async function executeOnFirstPair(
  w: PresenterWorld,
  direction: Direction,
  notional: number,
): Promise<{ status: ExecutionStatus; notional: number }> {
  const pair =
    w.scratch.firstPair ??
    (await firstValueFrom(w.ctx.app.presenters.currencyPairs.pairs$))[0]!;
  w.scratch.firstPair = pair;
  const price = await firstValueFrom(
    w.ctx.app.presenters.priceStream.price$(pair),
  );
  const result = await firstValueFrom(
    w.ctx.app.presenters.execution
      .execute({ pair, direction, price, notional })
      .pipe(take(1), timeout(5000)),
  );
  return { status: result.status, notional: result.trade.notional };
}

export async function executeBuyOnFirstTile(w: PresenterWorld): Promise<void> {
  const r = await executeOnFirstPair(w, DIR_BUY, 1_000_000);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = DIR_BUY;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

export async function executeSellOnFirstTile(w: PresenterWorld): Promise<void> {
  const r = await executeOnFirstPair(w, DIR_SELL, 1_000_000);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = DIR_SELL;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

export async function executeBuyWithNotional(
  w: PresenterWorld,
  notional: number,
): Promise<void> {
  const r = await executeOnFirstPair(w, DIR_BUY, notional);
  w.scratch.lastTradeStatus = r.status;
  w.scratch.lastTradeDirection = DIR_BUY;
  w.scratch.lastTradeNotional = r.notional;
  w.scratch.observedTradeCount += 1;
}

/**
 * UI patterns ("/You Bought/i", "/Executing/i", etc.) describe the React-rendered
 * confirmation text. At presenter level the equivalent is the ExecutionStatus enum
 * returned by execute(). This table maps UI patterns to the presenter statuses they
 * correspond to. A scenario passes if the observed status is any value mapped by ANY
 * of the patterns asserted by the scenario.
 */
const UI_PATTERN_TO_STATUSES: Array<{
  test: (p: RegExp) => boolean;
  statuses: ExecutionStatus[];
}> = [
  {
    test: (p) => /Executing|You Bought|You Sold|Bought|Sold/i.test(p.source),
    statuses: [ES_DONE],
  },
  {
    test: (p) => /rejected/i.test(p.source),
    statuses: [ES_REJECTED],
  },
  {
    test: (p) => /Credit limit/i.test(p.source),
    statuses: [ES_CREDIT_EXCEEDED],
  },
  {
    test: (p) => /timed out/i.test(p.source),
    statuses: [ES_TIMEOUT],
  },
];

export async function expectTradeConfirmationMatchesOneOf(
  w: PresenterWorld,
  patterns: RegExp[],
): Promise<void> {
  const status = w.scratch.lastTradeStatus;
  if (!status) throw new Error("no trade status captured");
  const accepted = new Set<ExecutionStatus>();
  for (const p of patterns) {
    for (const rule of UI_PATTERN_TO_STATUSES) {
      if (rule.test(p)) for (const s of rule.statuses) accepted.add(s);
    }
    // Also allow direct enum-name match (e.g. pattern /Done/i matches "Done")
    if (p.test(status as unknown as string)) accepted.add(status);
  }
  if (!accepted.has(status)) {
    throw new Error(
      `presenter status "${status as unknown as string}" not in accepted set [${[...accepted].map((s) => s as unknown as string).join(", ")}] ` +
        `(from UI patterns ${patterns.map(String).join(", ")})`,
    );
  }
}

/**
 * Buys N times, deliberately targeting GBPJPY which the ExecutionSimulator
 * always rejects deterministically. This guarantees at least one rejection
 * while keeping execution time predictable (no EURJPY 4-second delay).
 * Falls back to the first pair if GBPJPY is not in the pair list.
 */
export async function buyNTimesWithDismissals(
  w: PresenterWorld,
  n: number,
): Promise<void> {
  // Resolve all available pairs once
  const pairs = await firstValueFrom(
    w.ctx.app.presenters.currencyPairs.pairs$,
  );

  // Prefer GBPJPY (always rejected in simulator) for a deterministic result.
  const gbpjpy = pairs.find((p) => p.symbol === "GBPJPY") ?? pairs[0]!;

  for (let i = 0; i < n; i++) {
    const price = await firstValueFrom(
      w.ctx.app.presenters.priceStream.price$(gbpjpy),
    );
    const result = await firstValueFrom(
      w.ctx.app.presenters.execution
        .execute({ pair: gbpjpy, direction: DIR_BUY, price, notional: 1_000_000 })
        .pipe(take(1), timeout(5000)),
    );
    if ((result.status as unknown as string) === "Rejected") {
      w.scratch.rejectedSeen = true;
    }
    w.scratch.observedTradeCount += 1;
  }
}

export async function expectAtLeastOneRejection(
  w: PresenterWorld,
): Promise<void> {
  if (!w.scratch.rejectedSeen)
    throw new Error("no rejected trade observed across N attempts");
}

export async function dismissTradeConfirmation(
  _w: PresenterWorld,
): Promise<void> {
  // UI-only: at presenter level the confirmation observable completes after one
  // emission. No action needed.
}

export async function expectTradeConfirmationHides(
  _w: PresenterWorld,
): Promise<void> {
  // UI-only counterpart to "dismiss".
}

export async function expectTradeNotionalEquals(
  w: PresenterWorld,
  expected: number,
): Promise<void> {
  if (w.scratch.lastTradeNotional !== expected) {
    throw new Error(
      `trade notional ${w.scratch.lastTradeNotional} != expected ${expected}`,
    );
  }
}

export async function expectBlotterVisible(w: PresenterWorld): Promise<void> {
  // At presenter level, blotter is "visible" if trades$ emits (the observable exists).
  // We just assert the observable resolves without error.
  await firstValueFrom(
    w.ctx.app.presenters.blotter.trades$.pipe(timeout(3000)),
  );
}

export async function expectBlotterHasAtLeastNRows(
  w: PresenterWorld,
  n: number,
): Promise<void> {
  const trades = await firstValueFrom(
    w.ctx.app.presenters.blotter.trades$.pipe(timeout(3000)),
  );
  if (trades.length < n) {
    throw new Error(
      `blotter has ${trades.length} rows, expected at least ${n}`,
    );
  }
}
