import type { StateObservable } from "@react-rxjs/core";

/** Every app-layer machine factory returns this: a react-rxjs StateObservable
 * carrying current state, plain intent methods, and dispose() that completes
 * the machine's Subjects / tears down subscriptions. Bridge-only consumer. */
export interface Machine<TState, TIntents extends object> {
  state$: StateObservable<TState>;
  intents: TIntents;
  dispose: () => void;
}
