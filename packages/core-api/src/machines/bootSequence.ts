import type { BootVariant } from "@rtc/domain";

export interface BootSequenceState {
  readonly variant: BootVariant;
  readonly progress: number;
  readonly done: boolean;
}

export interface BootSequenceIntents {
  skip: () => void;
}

export interface BootSequenceDeps {
  /** Current persisted cycle index → the variant for this run. Read once at construction. */
  readonly variant: BootVariant;
  /** Advance the persisted cycle pointer to the next variant (preferences seam; NO localStorage here). */
  readonly advance: (next: BootVariant) => void;
  /** When the ramp completes (or skip fires), notify the shell to cross-fade. */
  readonly onDone: () => void;
}
