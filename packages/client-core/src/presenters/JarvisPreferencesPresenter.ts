import { type Observable, shareReplay } from "rxjs";

import type { JarvisBrain, JarvisEffort, PreferencesPort } from "@rtc/domain";

/**
 * App-layer presenter for the two Jarvis desk-assistant preferences: which
 * brain powers it (`brain` — `"scripted"` or a live `claude-*` model) and the
 * thinking-effort budget forwarded to a live brain (`effort`, ignored by
 * `"scripted"`).
 *
 * Mirrors `LoginWaitPreferencesPresenter` exactly: one presenter for both
 * because they are a single user-facing concern — "how Jarvis should think" —
 * always shown as an adjacent pair in the Preferences modal's JARVIS section.
 * Note this presenter only exposes the user's STORED preference; the brain a
 * turn actually runs with (`JarvisState.effectiveBrain`, folding in live
 * availability) lives on `useJarvis()` instead — see that hook's doc.
 */
export class JarvisPreferencesPresenter {
  readonly brain$: Observable<JarvisBrain>;

  readonly effort$: Observable<JarvisEffort>;

  constructor(private readonly preferences: PreferencesPort) {
    this.brain$ = preferences
      .jarvisBrain$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.effort$ = preferences
      .jarvisEffort$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setBrain(brain: JarvisBrain): void {
    this.preferences.setJarvisBrain(brain);
  }

  setEffort(effort: JarvisEffort): void {
    this.preferences.setJarvisEffort(effort);
  }
}
