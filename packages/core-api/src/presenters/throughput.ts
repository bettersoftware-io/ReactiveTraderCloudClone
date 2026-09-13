import type { StateStream } from "#/stream";

/** The status banner the AdminPanel renders. */
interface ThroughputMessage {
  text: string;
  isError: boolean;
}

/** The view the AdminPanel reads: the slider/input value, the initial-load
 *  flag, and the optional confirmation/error banner. */
export interface ThroughputView {
  value: number;
  loading: boolean;
  message: ThroughputMessage | null;
}

/**
 * Throughput control state. Global/shared (a single server-side throughput),
 * so the seam binds this presenter's `state$` directly rather than through a
 * per-mount machine.
 *
 * Behaviour:
 *  - initial load starts in `loading: true`, falling back to the default value
 *    (not-loading) on error;
 *  - `setValue` optimistically reflects the value immediately, then debounces
 *    the write; on success a confirmation banner auto-dismisses, on failure an
 *    error banner does the same.
 */
export interface ThroughputPresenter {
  readonly state$: StateStream<ThroughputView>;
  /** Optimistically set the value and schedule a debounced persist. */
  setValue(value: number): void;
}
