import { Option, Stream } from "effect";

import {
  createActivityScan,
  createNewTradeScan,
  reduceActivity,
  reduceNewTrades,
} from "@rtc/client-core";
import type { ActivityEntry, BlotterPresenter } from "@rtc/core-api";
import { type BlotterPort, TradeBlotterUseCase } from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** `trades$` is the retained mirror of the port. `newTradeIds$` is a
 * refCounted fold over it whose scan state lives in the period's producer
 * (a fresh period restarts from "nothing seen", as the RxJS `scan` under a
 * refCounted `shareReplay` does); `activity$` is the same fold RETAINED
 * for the session. Both run the RxJS core's reducers, imported. `now` is
 * injectable so a test can pin the clock stamp. */
export function createBlotterPresenter(
  host: EffectHost,
  blotter: BlotterPort,
  now: () => number = Date.now,
): BlotterPresenter {
  // Called ONCE, here.
  const source = new TradeBlotterUseCase(blotter).execute();
  const trades$ = mirrorPortAsIs(host, source, { retain: true });

  return {
    trades$,
    newTradeIds$: sharedFold<ReadonlySet<number>>(host, {
      seed: () => {
        return Option.none();
      },
      run: (update: FoldUpdate<ReadonlySet<number>>, fromPort: FromPort) => {
        let scan = createNewTradeScan();
        return fromPort(trades$).pipe(
          Stream.runForEach((snapshot) => {
            scan = reduceNewTrades(scan, snapshot);
            const { fresh } = scan;
            return update(() => {
              return fresh;
            });
          }),
        );
      },
    }),
    activity$: sharedFold<readonly ActivityEntry[]>(host, {
      retain: true,
      seed: () => {
        return Option.none();
      },
      run: (
        update: FoldUpdate<readonly ActivityEntry[]>,
        fromPort: FromPort,
      ) => {
        let scan = createActivityScan();
        return fromPort(trades$).pipe(
          Stream.runForEach((snapshot) => {
            scan = reduceActivity(scan, snapshot, now());
            const { entries } = scan;
            return update(() => {
              return entries;
            });
          }),
        );
      },
    }),
  };
}
