import type { StateStream } from "#/stream";

/** Every app-layer machine factory returns this: a framework-agnostic
 * StateStream carrying current state, plain intent methods, and dispose()
 * that completes the machine's sources / tears down subscriptions.
 * Bridge-only consumer.
 *
 * Pre-condition: `state$` MUST have a live subscriber before `useMachine`
 * first renders, OR carry a synchronous default value. Factory
 * implementations are responsible for keeping it warm. A cold `state$` with
 * no default will suspend. */
export interface Machine<TState, TIntents extends object> {
  state$: StateStream<TState>;
  intents: TIntents;
  dispose: () => void;
}

/** A machine with no intents — a purely derived, read-only state stream. */
export type ReadOnlyMachine<TState> = Machine<TState, Record<string, never>>;
