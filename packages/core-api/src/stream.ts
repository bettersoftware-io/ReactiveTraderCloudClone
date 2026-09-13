import type { StateObservable } from "@rx-state/core";
import type { Observable } from "rxjs";

/** The envelope every core hands the bindings for a multi-value stream.
 * Named once so the later flip to the web-standard `Observable` is an alias
 * edit plus the per-core `bridge/` modules — never a signature refactor. */
export type Stream<T> = Observable<T>;

/** The envelope for machine state: a `Stream` that also carries its current
 * value synchronously on subscribe (the warmth precondition `toSignal` and
 * `useStateObservable` rely on). */
export type StateStream<S> = StateObservable<S>;
