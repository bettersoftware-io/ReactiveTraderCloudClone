import type { BootVariant } from "@rtc/domain";

/**
 * The boot-sequence variant preference: a synchronous `current()` read (safe
 * because the preference stream is replay-current) and the write operation,
 * keeping persistence out of the UI and out of the boot-sequence machine.
 */
export interface BootPreferencePresenter {
  /** Synchronous read of the current persisted boot variant. */
  current(): BootVariant;
  setVariant(variant: BootVariant): void;
}
