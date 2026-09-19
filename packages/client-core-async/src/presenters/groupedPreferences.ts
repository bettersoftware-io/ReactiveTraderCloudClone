import type {
  JarvisPreferencesPresenter,
  LoginWaitPreferencesPresenter,
} from "@rtc/core-api";
import type {
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
  LoginWaitDelay,
  LoginWaitStyle,
  PreferencesPort,
} from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";

/** Presenters that group several independent preferences under one member
 * because the UI always shows them together. Each stream is its own
 * `topicFromObservable` over its own port stream — its own refCount, its own
 * port subscription — so setting one never emits on another. */

export function createLoginWaitPreferencesPresenter(
  preferences: PreferencesPort,
): LoginWaitPreferencesPresenter {
  return {
    style$: topicToStream(topicFromObservable(preferences.loginWaitStyle$())),
    delay$: topicToStream(topicFromObservable(preferences.loginWaitDelay$())),
    setStyle: (style: LoginWaitStyle) => {
      preferences.setLoginWaitStyle(style);
    },
    setDelay: (delay: LoginWaitDelay) => {
      preferences.setLoginWaitDelay(delay);
    },
  };
}

export function createJarvisPreferencesPresenter(
  preferences: PreferencesPort,
): JarvisPreferencesPresenter {
  return {
    brain$: topicToStream(topicFromObservable(preferences.jarvisBrain$())),
    effort$: topicToStream(topicFromObservable(preferences.jarvisEffort$())),
    narrator$: topicToStream(
      topicFromObservable(preferences.jarvisNarrator$()),
    ),
    setBrain: (brain: JarvisBrain) => {
      preferences.setJarvisBrain(brain);
    },
    setEffort: (effort: JarvisEffort) => {
      preferences.setJarvisEffort(effort);
    },
    setNarrator: (preference: JarvisNarratorPreference) => {
      preferences.setJarvisNarrator(preference);
    },
  };
}
