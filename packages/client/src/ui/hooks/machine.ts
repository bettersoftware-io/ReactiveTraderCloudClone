import type { StateObservable } from "@react-rxjs/core";

/** Every app-layer machine factory returns this: a react-rxjs StateObservable
 * carrying current state, plain intent methods, and dispose() that completes
 * the machine's Subjects / tears down subscriptions. Bridge-only consumer.
 *
 * Pre-condition: `state$` MUST have a live subscriber (refCount > 0) before
 * `useMachine` first renders, OR carry a synchronous default value via
 * react-rxjs `state(obs, default)`. Factory implementations are responsible
 * for keeping it warm (e.g. an internal `state$.subscribe()` torn down in
 * `dispose()`). A cold `state$` with no default will suspend. */
export interface Machine<TState, TIntents extends object> {
  state$: StateObservable<TState>;
  intents: TIntents;
  dispose: () => void;
}
