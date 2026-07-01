import { take } from "rxjs";

import type { BootVariant, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the boot-sequence variant preference. Exposes a
 * synchronous current() read (safe because PreferencesPort.bootVariant$() is
 * replay-current / BehaviorSubject-backed) and the write operation, keeping
 * persistence out of the UI and out of BootSequenceMachine.
 */
export class BootPreferencePresenter {
  constructor(private readonly preferences: PreferencesPort) {}

  /** Synchronous read of the current persisted boot variant.
   * Safe because `bootVariant$()` is replay-current (BehaviorSubject-backed)
   * and emits its initial value synchronously on subscribe. */
  current(): BootVariant {
    let value!: BootVariant;
    this.preferences
      .bootVariant$()
      .pipe(take(1))
      .subscribe((v) => {
        value = v;
      });
    return value;
  }

  setVariant(variant: BootVariant): void {
    this.preferences.setBootVariant(variant);
  }
}
