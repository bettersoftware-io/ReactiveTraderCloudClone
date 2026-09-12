import type { Stream } from "#/stream";

/**
 * The force-boot-animation preference: the replay-current enabled flag and the
 * write/toggle operations. When on, the boot splash plays even under
 * prefers-reduced-motion.
 */
export interface ForceBootAnimationPresenter {
  readonly enabled$: Stream<boolean>;
  set(on: boolean): void;
  /** Flip on↔off relative to the supplied current value. */
  toggle(current: boolean): void;
}
