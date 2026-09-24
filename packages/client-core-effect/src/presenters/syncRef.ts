import { SubscriptionRef } from "effect";

import {
  type EffectHost,
  listenToWarmStateStream,
  setRefIfChanged,
  type WarmStateStream,
} from "#/bridge/out";

/** A `SubscriptionRef` whose writes COMMIT synchronously (`runSync`) and
 * whose in-core listeners AND subscribers (`warm()`) hear a committed change
 * synchronously too — never through `ref.changes`.
 *
 * Why: the workspace's state is a synchronous fold (the
 * contract stated in `@rtc/core-contract`'s `workspaceKit`) — the shared
 * `createWorkspaceDock` reads the roster and the recorded layout states
 * right after calling into them, and the persistence kicks and the docked
 * membership must follow each change in the same tick. `ref.changes` is
 * delivered on a fiber, a step later — measured in the browser: after a
 * reload the restored docked panel reached the UI's first render one step
 * late, the Dockview bridge's orphan scrub read the empty set and threw
 * the panel's dragged position away. So both the mirrors and the UI hear a
 * commit synchronously. */
export interface SyncRef<S> {
  get(): S;
  /** Commit `next` (dropped when `Object.is`-equal) and notify listeners. */
  set(next: (current: S) => S): void;
  /** Hear every committed change; called at once with the current value,
   * as the async core's `Store.subscribe`. */
  listen(listener: (value: S) => void): () => void;
  /** The ref as a warm `StateStream`, fed from the commit path (one per
   * call — hold on to it). */
  warm(): WarmStateStream<S>;
}

export function createSyncRef<S>(host: EffectHost, initial: S): SyncRef<S> {
  const ref = host.runtime.runSync(SubscriptionRef.make(initial));
  const listeners = new Set<(value: S) => void>();

  function get(): S {
    return host.runtime.runSync(SubscriptionRef.get(ref));
  }

  function listen(listener: (value: S) => void): () => void {
    listeners.add(listener);
    listener(get());

    return () => {
      listeners.delete(listener);
    };
  }

  return {
    get,
    set: (next: (current: S) => S) => {
      const previous = get();
      host.runtime.runSync(setRefIfChanged(ref, next));
      const current = get();

      if (Object.is(previous, current)) {
        return;
      }

      // Each listener hears the value CURRENT when it is called: a listener
      // that writes this ref re-enters `set`, and a later listener must not
      // then hear the older value after the newer one.
      for (const listener of [...listeners]) {
        listener(get());
      }
    },
    listen,
    warm: () => {
      return listenToWarmStateStream(listen, get);
    },
  };
}
