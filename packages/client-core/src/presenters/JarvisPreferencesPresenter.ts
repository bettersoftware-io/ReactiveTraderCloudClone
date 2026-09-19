import { type Observable, shareReplay } from "rxjs";

import type { JarvisPreferencesPresenter as JarvisPreferencesPresenterApi } from "@rtc/core-api";
import type {
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  PreferencesPort,
} from "@rtc/domain";

/** Implements `JarvisPreferencesPresenter` (`@rtc/core-api`) — see the
 * interface for the contract. Mirrors `LoginWaitPreferencesPresenter`
 * exactly: one presenter for all three because they are a single
 * user-facing concern, always shown together in the Preferences modal's
 * JARVIS section. The brain a turn actually runs with lives on
 * `useJarvis()` instead — see that hook's doc. */
export class JarvisPreferencesPresenter
  implements JarvisPreferencesPresenterApi
{
  readonly brain$: Observable<JarvisBrain>;

  readonly effort$: Observable<JarvisEffort>;

  readonly narrator$: Observable<JarvisNarratorPreference>;

  constructor(private readonly preferences: PreferencesPort) {
    this.brain$ = preferences
      .jarvisBrain$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.effort$ = preferences
      .jarvisEffort$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.narrator$ = preferences
      .jarvisNarrator$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setBrain(brain: JarvisBrain): void {
    this.preferences.setJarvisBrain(brain);
  }

  setEffort(effort: JarvisEffort): void {
    this.preferences.setJarvisEffort(effort);
  }

  setNarrator(preference: JarvisNarratorPreference): void {
    this.preferences.setJarvisNarrator(preference);
  }
}
