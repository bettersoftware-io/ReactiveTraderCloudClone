import type { Stream } from "#/stream";

/**
 * The ambient-motion perf gate: the replay-current enabled flag and the
 * write/toggle operations.
 */
export interface AnimatedBackgroundPresenter {
  readonly enabled$: Stream<boolean>;
  set(on: boolean): void;
  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void;
}
