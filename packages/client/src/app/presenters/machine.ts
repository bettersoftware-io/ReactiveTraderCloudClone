import type { StateObservable } from "@rx-state/core";
import type { CurrencyPair } from "@rtc/domain";
import type {
  TileExecutionState,
  TileExecutionIntents,
} from "./TileExecutionMachine";

/** Every app-layer machine factory returns this: a framework-agnostic
 * StateObservable carrying current state, plain intent methods, and dispose()
 * that completes the machine's Subjects / tears down subscriptions.
 * Bridge-only consumer.
 *
 * `StateObservable` comes from @rx-state/core (rxjs-only), the framework-
 * agnostic package — never from the React-binding layer — so the app layer
 * stays free of any React dependency.
 *
 * Pre-condition: `state$` MUST have a live subscriber (refCount > 0) before
 * `useMachine` first renders, OR carry a synchronous default value via
 * `state(obs, default)`. Factory implementations are responsible for keeping it
 * warm (e.g. an internal `state$.subscribe()` torn down in `dispose()`). A cold
 * `state$` with no default will suspend. */
export interface Machine<TState, TIntents extends object> {
  state$: StateObservable<TState>;
  intents: TIntents;
  dispose: () => void;
}

/** App-layer machine factories injected into the hooks seam. Each builds a
 * fresh machine instance per component mount (useMachine owns its lifecycle). */
export interface MachineFactories {
  tileExecution: (
    pair: CurrencyPair,
  ) => Machine<TileExecutionState, TileExecutionIntents>;
}
