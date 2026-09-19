import type { Observable } from "rxjs";

import type { BootPreferencePresenter as BootPreferencePresenterApi } from "@rtc/core-api";
import {
  type BootVariant,
  DEFAULT_BOOT_VARIANT,
  type PreferencesPort,
} from "@rtc/domain";

import { readNow } from "./readNow";

/**
 * App-layer presenter for the boot-sequence variant preference. Exposes a
 * synchronous current() read (safe because PreferencesPort.bootVariant$() is
 * replay-current / BehaviorSubject-backed) and the write operation, keeping
 * persistence out of the UI and out of BootSequenceMachine.
 */
export class BootPreferencePresenter implements BootPreferencePresenterApi {
  /** The port's stream, captured once at construction — `current()` reads
   * through a fresh subscription of THIS Observable rather than a fresh call
   * of `preferences.bootVariant$()`, so the port method is called once
   * regardless of how many times current() runs. */
  private readonly bootVariant$: Observable<BootVariant>;

  constructor(private readonly preferences: PreferencesPort) {
    this.bootVariant$ = preferences.bootVariant$();
  }

  /** Synchronous read of the current persisted boot variant.
   * Safe because `bootVariant$()` is replay-current (BehaviorSubject-backed)
   * and emits its initial value synchronously on subscribe. */
  current(): BootVariant {
    return readNow(this.bootVariant$, DEFAULT_BOOT_VARIANT);
  }

  setVariant(variant: BootVariant): void {
    this.preferences.setBootVariant(variant);
  }
}
