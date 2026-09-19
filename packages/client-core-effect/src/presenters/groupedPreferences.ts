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

import type { EffectHost } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** Presenters that group several independent preferences under one member
 * because the UI always shows them together. Each stream is its own
 * `mirrorPortAsIs` over its own port stream — its own warm period, its own
 * port subscription — so setting one never emits on another. */

export function createLoginWaitPreferencesPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): LoginWaitPreferencesPresenter {
  return {
    style$: mirrorPortAsIs(host, preferences.loginWaitStyle$()),
    delay$: mirrorPortAsIs(host, preferences.loginWaitDelay$()),
    setStyle: (style: LoginWaitStyle) => {
      preferences.setLoginWaitStyle(style);
    },
    setDelay: (delay: LoginWaitDelay) => {
      preferences.setLoginWaitDelay(delay);
    },
  };
}

export function createJarvisPreferencesPresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): JarvisPreferencesPresenter {
  return {
    brain$: mirrorPortAsIs(host, preferences.jarvisBrain$()),
    effort$: mirrorPortAsIs(host, preferences.jarvisEffort$()),
    narrator$: mirrorPortAsIs(host, preferences.jarvisNarrator$()),
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
