import { Effect } from "effect";

import type { StateStream } from "@rtc/core-api";

import {
  listenToStateStream,
  listenToWarmStateStream,
  type WarmStateStream,
} from "#/bridge/out";

/** Where this core keeps a piece of state it owns — a machine's, a
 * presenter's flag: a plain cell whose writes COMMIT synchronously and
 * whose listeners and subscribers hear a committed change before the write
 * returns. Not Effect's `SubscriptionRef` (grep gate 50), for two measured
 * reasons:
 *
 * - a `SubscriptionRef` reaches a subscriber through `ref.changes`, read by
 *   a fiber PER SUBSCRIBER. Moving the machines off it took the time spent
 *   in fibers in the FX screen's first two seconds from 57 ms to 37 ms
 *   (2026-10-05);
 * - that fiber delivers a step after the commit. The workspace's state is a
 *   synchronous fold (`@rtc/core-contract`'s `workspaceKit`): the shared
 *   `createWorkspaceDock` reads the roster and the recorded layout states
 *   right after calling into them. Measured in the browser, a step late
 *   meant a restored docked panel reached the UI's first render after the
 *   Dockview bridge's orphan scrub had read the empty set and thrown the
 *   panel's dragged position away.
 *
 * A fiber writes through `write` (the same commit, as an Effect); plain
 * code — an intent — calls `set`. Either way a subscriber is called from
 * inside the write, as an RxJS `BehaviorSubject`'s is. */
export interface SyncRef<S> {
  get(): S;
  /** Commit `next` (dropped when `Object.is`-equal — a state stream's
   * `distinctUntilChanged`) and notify listeners. */
  set(next: (current: S) => S): void;
  /** `set` as an Effect, for a fiber's own steps. */
  write(next: (current: S) => S): Effect.Effect<void>;
  /** Hear every committed change; called at once with the current value,
   * as the async core's `Store.subscribe`. */
  listen(listener: (value: S) => void): () => void;
  /** The ref as a `StateStream` (one per call — hold on to it). The current
   * value is read PER SUBSCRIPTION, so a write made while nobody is
   * subscribed is what the next subscriber starts from. Not held warm: with
   * no subscriber, `getValue()` hands back the value the ref held when this
   * was called — use `warm()` where a first render reads it. `onSubscribe`
   * runs on each zero-to-one subscriber transition (`@rx-state/core` shares
   * the source): how a presenter starts a lazy load on its first
   * subscriber. */
  stateStream(onSubscribe?: () => void): StateStream<S>;
  /** `stateStream()` held warm by a subscription of its own, for an
   * app-lifetime singleton (one per call — hold on to it). */
  warm(): WarmStateStream<S>;
}

export function createSyncRef<S>(initial: S): SyncRef<S> {
  const listeners = new Set<(value: S) => void>();
  let current = initial;
  let commits = 0;

  function get(): S {
    return current;
  }

  function set(next: (current: S) => S): void {
    const value = next(current);

    if (Object.is(value, current)) {
      return;
    }

    current = value;
    commits += 1;
    const commit = commits;

    for (const listener of [...listeners]) {
      // A listener that writes this ref commits again from inside this
      // loop, and THAT commit has told every listener the newer value
      // already. Carrying on would hand the rest of them the older value
      // after the newer one.
      if (commits !== commit) {
        return;
      }

      listener(value);
    }
  }

  function listen(listener: (value: S) => void): () => void {
    listeners.add(listener);
    listener(current);

    return () => {
      listeners.delete(listener);
    };
  }

  return {
    get,
    set,
    write: (next: (current: S) => S) => {
      return Effect.sync(() => {
        set(next);
      });
    },
    listen,
    stateStream: (onSubscribe: () => void = () => {}) => {
      return listenToStateStream((listener: (value: S) => void) => {
        onSubscribe();
        return listen(listener);
      }, get);
    },
    warm: () => {
      return listenToWarmStateStream(listen, get);
    },
  };
}
