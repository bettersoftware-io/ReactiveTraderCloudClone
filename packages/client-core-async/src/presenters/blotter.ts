import type { ActivityEntry, BlotterPresenter } from "@rtc/core-api";
import {
  createActivityScan,
  createNewTradeScan,
  reduceActivity,
  reduceNewTrades,
} from "@rtc/core-logic";
import { type BlotterPort, TradeBlotterUseCase } from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { relayTopic } from "#/kernel/relayTopic";
import { createTopic } from "#/kernel/topic";

/** `trades$` is the warm singleton (retained until `lifetime` aborts).
 * `newTradeIds$` is a refCounted fold over it — its scan state is
 * producer-local, so a fresh warm period restarts from "nothing seen" and
 * the current snapshot marks nothing, as the RxJS `scan` under a
 * refCounted `shareReplay` does. `activity$` is the same fold shape but
 * RETAINED: the feed accumulates for the session and survives every
 * unmount. Both folds are the reducers the RxJS core runs, imported. `now`
 * is injectable so a test can pin the clock stamp. */
export function createBlotterPresenter(
  blotter: BlotterPort,
  lifetime: AbortSignal,
  now: () => number = Date.now,
): BlotterPresenter {
  // Called ONCE, here.
  const source = new TradeBlotterUseCase(blotter).execute();
  const trades = topicFromObservable(source, lifetime);

  const newTradeIds = createTopic<ReadonlySet<number>>(
    (signal, publish) => {
      let scan = createNewTradeScan();
      return relayTopic(trades, signal, (snapshot) => {
        scan = reduceNewTrades(scan, snapshot);
        publish(scan.fresh);
      });
    },
    { replay: true },
  );

  const activity = createTopic<readonly ActivityEntry[]>(
    (signal, publish) => {
      let scan = createActivityScan();
      return relayTopic(trades, signal, (snapshot) => {
        scan = reduceActivity(scan, snapshot, now());
        publish(scan.entries);
      });
    },
    { replay: true, retainUntil: lifetime },
  );

  return {
    trades$: topicToStream(trades),
    newTradeIds$: topicToStream(newTradeIds),
    activity$: topicToStream(activity),
  };
}
