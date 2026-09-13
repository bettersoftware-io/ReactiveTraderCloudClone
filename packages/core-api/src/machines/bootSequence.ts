import type { BootVariant } from "@rtc/domain";

export interface BootSequenceState {
  readonly variant: BootVariant;
  readonly progress: number;
  readonly done: boolean;
}

export interface BootSequenceIntents {
  skip: () => void;
}
