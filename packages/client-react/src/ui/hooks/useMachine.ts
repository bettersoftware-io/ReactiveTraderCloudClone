import { useStateObservable } from "@react-rxjs/core";
import { useEffect, useRef } from "react";

import type { Machine } from "#/app/presenters/machine";

type MachineView<TState, TIntents> = { state: TState } & TIntents;

/** Logic-free bridge: instantiates the factory once per mount (lazy useRef so
 * StrictMode double-render can't double-instantiate), reads state$ via
 * useStateObservable, returns { state, ...intents } (stable intent refs), and
 * disposes on unmount. The only UI primitive allowed to import react-rxjs;
 * components never import it (createViewModel does).
 *
 * Why a hand-written bridge and NOT react-rxjs `bind`: `bind`/`state` model
 * GLOBAL, shared, refcounted singletons (one stream the whole app reads — e.g.
 * prices, throughput, theme; those use `bind` directly, no bridge). A machine
 * here is the opposite: ONE PER COMPONENT INSTANCE, constructed with that
 * instance's args (e.g. the tile's CurrencyPair), born and disposed with that
 * mount. react-rxjs has no primitive for "instantiate this factory per mount
 * and tear it down on unmount" — a component instance's LIFETIME isn't a value
 * stream you can `bind`, it's React's ref/effect model. So this bridge owns only
 * that lifecycle; the DATA read is still react-rxjs (`useStateObservable`) and
 * the machine's LOGIC is still pure RxJS (in the factory). Nothing logic-shaped
 * lives here — only the irreducibly-React per-instance lifecycle glue.
 *
 * StrictMode-safe disposal: React 19 StrictMode runs the mount-time effect
 * cycle setup -> cleanup -> setup synchronously within the commit. The machine
 * lives in a lazy useRef (created once), so a cleanup that disposed eagerly
 * would kill the very machine the immediate re-setup keeps using — leaving the
 * live component holding a disposed machine (intents push into completed
 * Subjects, state$ never emits again). We instead DEFER disposal to a
 * microtask, scheduled in cleanup and cancelled by an immediate re-setup: the
 * StrictMode remount cancels the pending disposal (machine survives), while a
 * REAL unmount (no following setup) lets the microtask run and dispose exactly
 * once. A microtask suffices because StrictMode's double-invoke is synchronous
 * within the commit, so it always runs before the scheduled microtask. */
export function useMachine<TState, TIntents extends object & { state?: never }>(
  factory: () => Machine<TState, TIntents>,
): MachineView<TState, TIntents> {
  const ref = useRef<Machine<TState, TIntents> | null>(null);
  if (ref.current === null) ref.current = factory();
  const machine = ref.current;
  const keepAlive = useRef(true);
  useEffect(() => {
    keepAlive.current = true; // a re-setup (StrictMode remount) cancels a pending disposal

    return () => {
      keepAlive.current = false;
      queueMicrotask(() => {
        if (!keepAlive.current) {
          machine.dispose();
          ref.current = null;
        }
      });
    };
  }, [machine]);
  const state = useStateObservable(machine.state$);
  return { state, ...machine.intents };
}
